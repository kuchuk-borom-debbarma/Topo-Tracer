import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { ILogService } from "../../api/ILogService";
import {
  IngestEdgeStart,
  IngestNodeStart,
  IngestNodeEnd,
  IngestEdgeEnd,
  ProjectedGraphResult,
} from "../../api/types";
import { createLogWriteRepo, createLogReadRepo } from "../repo";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { LogGraphProjector } from "../projection/LogGraphProjector";

/**
 * Default upper limits for row queries when projecting graphs.
 */
const DEFAULT_PROJECTION_NODE_CAP = 500;

/**
 * Concrete implementation of the Log Service.
 * Following code-base.md guidelines:
 * - Owns coordination and validation of business workflows for traces.
 * - Restricts database client usage behind repository contracts (writeRepo, readRepo).
 * - Interfaces with the event bus to publish asynchronous model materialization signals.
 * - Leverages dependency injection via constructor options.
 */
export class LogServiceImpl extends ILogService {
  readonly logger: Logger<unknown>;
  readonly writeRepo: ILogWriteRepo;
  readonly readRepo: ILogReadRepo;
  readonly eventBus: IEventBus;
  readonly projector: LogGraphProjector;

  constructor(
    logger: Logger<unknown>,
    eventBus: IEventBus,
    writeRepo?: ILogWriteRepo,
    readRepo?: ILogReadRepo,
    projector?: LogGraphProjector,
  ) {
    super();
    this.logger = logger.getSubLogger({ name: "LogServiceImpl" });
    this.eventBus = eventBus;
    this.writeRepo = writeRepo ?? createLogWriteRepo(this.logger);
    this.readRepo = readRepo ?? createLogReadRepo(this.logger);
    this.projector = projector ?? new LogGraphProjector();
  }

  /**
   * Orchestrates the ingestion of a batch of node and edge lifecycle events.
   * Following the reactive flow to ensure durability without database polling:
   * 1. Validates the event payloads (e.g., ensuring edges have valid from/to nodes).
   * 2. Publishes the raw telemetry event batch to the event bus under "log.telemetry.received".
   * 3. A reactive background worker consumes this event, writes it to ClickHouse, and triggers materialization.
   */
  async ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    this.logger.trace("ingestNodesNEdges", {
      userId: data.userId,
      nodeStarts: data.nodeStarts.length,
      edgeStarts: data.edgeStarts.length,
      nodeEnds: data.nodeEnds.length,
      edgeEnds: data.edgeEnds.length,
    });

    try {
      this.validateEdgeStarts(data.edgeStarts);
      
      const totalEvents =
        data.nodeStarts.length +
        data.edgeStarts.length +
        data.nodeEnds.length +
        data.edgeEnds.length;
      if (totalEvents === 0) {
        return;
      }

      const idempotencyId = this.buildTelemetryReceivedIdempotencyId(data);

      this.logger.trace("publishing raw telemetry received event reactively", {
        userId: data.userId,
        idempotencyId,
      });

      // Publish the raw events batch to the event bus
      await this.eventBus.publish(
        [
          {
            topic: "log.telemetry.received",
            key: data.userId,
            idempotencyId,
            data,
          },
        ],
        {
          batchId: `log.telemetry.received:${data.userId}:${idempotencyId}`,
        },
      );
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  /**
   * Projects a trace graph filtered by importance threshold.
   * Steps:
   * 1. Loads nodes from the read-optimized tables within a maximum read cap.
   * 2. Loads visible edges linking those loaded nodes within a cap.
   * 3. Invokes the LogGraphProjector utility to collapse hidden nodes into ghost nodes.
   */
  async projectTraceGraph(data: {
    userId: string;
    traceId: string;
    threshold: number;
  }): Promise<ProjectedGraphResult> {
    const { userId, traceId, threshold } = data;

    // Load nodes and edges under hard limits (safety caps) to prevent memory exhaust
    const boundedNodes = await this.readRepo.loadBoundedProjectionNodes({
      userId,
      traceId,
      paging: { offset: 0, limit: DEFAULT_PROJECTION_NODE_CAP },
    });

    const boundedEdges = await this.readRepo.loadBoundedVisibleEdges({
      userId,
      traceId,
      nodeIds: boundedNodes.items.map((node) => node.id),
    });

    // Run local CPU projection rules to calculate visible normal and ghost nodes
    const result = this.projector.project({
      userId,
      traceId,
      threshold,
      nodes: boundedNodes.items,
      edges: boundedEdges.edges,
      nodeCap: {
        cap: DEFAULT_PROJECTION_NODE_CAP,
        returnedCount: boundedNodes.items.length,
        capHit: boundedNodes.hasMore,
      },
      edgeCap: boundedEdges.cap,
    });

    this.logger.trace("projectTraceGraph", {
      userId,
      traceId,
      threshold,
      returnedNodeCount: result.metadata.returnedNodeCount,
      returnedEdgeCount: result.metadata.returnedEdgeCount,
      visibleNodeCount: result.metadata.visibleNodeCount,
      ghostNodeCount: result.metadata.ghostNodeCount,
      nodeCapHit: result.metadata.nodeCap.capHit,
      edgeCapHit: result.metadata.edgeCap.capHit,
      omittedEdgeCount: result.metadata.omittedEdgeCount,
    });

    return result;
  }

  /**
   * Validates that edges have valid node references.
   */
  private validateEdgeStarts(edgeStarts: IngestEdgeStart[]): void {
    for (const edge of edgeStarts) {
      if (
        !this.isNonEmptyString(edge.fromNodeId) ||
        !this.isNonEmptyString(edge.toNodeId)
      ) {
        throw new Error("Edge start requires fromNodeId and toNodeId.");
      }
    }
  }

  /**
   * Checks for a non-empty string.
   */
  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  /**
   * Constructs a deterministic, payload-derived idempotency key for this batch of received events.
   */
  private buildTelemetryReceivedIdempotencyId(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): string {
    const parts = [
      ...data.nodeStarts.map((node) => `n-start:${node.id}`),
      ...data.nodeEnds.map((node) => `n-end:${node.id}`),
      ...data.edgeStarts.map((edge) => `e-start:${edge.id}`),
      ...data.edgeEnds.map((edge) => `e-end:${edge.id}`),
    ].sort();

    return `log.telemetry.received:${data.userId}:${parts.join("|")}`;
  }
}


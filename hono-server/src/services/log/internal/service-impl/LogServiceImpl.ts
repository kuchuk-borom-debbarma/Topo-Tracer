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
   * Steps:
   * 1. Validates the event payloads (e.g., ensuring edges have valid from/to nodes).
   * 2. Persists the raw events in ClickHouse (append-only database write).
   * 3. Group events by traceId to identify which traces are dirty.
   * 4. Publish ingestion events onto the event bus to trigger async read-model materialization.
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
      
      // Write raw events using repository (service does not contain raw SQL/Clickhouse setup)
      await this.writeRepo.ingestNodesNEdges(data);

      const traceIds = this.getTraceIds(data);
      if (traceIds.length === 0) {
        return;
      }

      this.logger.trace("publishing trace ingest events", {
        userId: data.userId,
        traceCount: traceIds.length,
      });

      // Publish notification for each modified trace to queue rebuilding the read models
      await this.eventBus.publish(
        traceIds.map((traceId) => ({
          topic: "log.trace.ingested",
          // traceId is the ordering key because read-model rebuild work for one
          // trace must observe the same order as the append-only writes.
          key: traceId,
          // The id is derived from this ingest's trace-local payload, not just
          // traceId, so retries dedupe while later ingests still produce events.
          idempotencyId: this.buildTraceIngestIdempotencyId(data, traceId),
          data: {
            userId: data.userId,
            traceId,
          },
        })),
        {
          // batchId is only for correlating this publish call in logs/brokers.
          batchId: `log.trace.ingested:${data.userId}:${traceIds.join(",")}`,
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
    });

    const boundedEdges = await this.readRepo.loadBoundedVisibleEdges({
      userId,
      traceId,
      nodeIds: boundedNodes.nodes.map((node) => node.id),
    });

    // Run local CPU projection rules to calculate visible normal and ghost nodes
    const result = this.projector.project({
      userId,
      traceId,
      threshold,
      nodes: boundedNodes.nodes,
      edges: boundedEdges.edges,
      nodeCap: boundedNodes.cap,
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
   * Extracts sorted unique trace IDs referenced inside the ingested event arrays.
   */
  private getTraceIds(data: {
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): string[] {
    return [
      ...new Set([
        ...data.nodeStarts.map((node) => node.traceId),
        ...data.edgeStarts.map((edge) => edge.traceId),
        ...data.nodeEnds.map((node) => node.traceId),
        ...data.edgeEnds.map((edge) => edge.traceId),
      ]),
    ].sort();
  }

  /**
   * Constructs a deterministic, payload-derived idempotency key for this batch of trace events.
   * Ensures redeliveries do not duplicate materialization commands, but later updates succeed.
   */
  private buildTraceIngestIdempotencyId(
    data: {
      userId: string;
      nodeStarts: IngestNodeStart[];
      edgeStarts: IngestEdgeStart[];
      nodeEnds: IngestNodeEnd[];
      edgeEnds: IngestEdgeEnd[];
    },
    traceId: string,
  ): string {
    const parts = [
      ...data.nodeStarts
        .filter((node) => node.traceId === traceId)
        .map((node) => `node-start:${node.id}:${node.startedAt}`),
      ...data.nodeEnds
        .filter((node) => node.traceId === traceId)
        .map((node) => `node-end:${node.id}:${node.endedAt}`),
      ...data.edgeStarts
        .filter((edge) => edge.traceId === traceId)
        .map((edge) => `edge-start:${edge.id}:${edge.startedAt}`),
      ...data.edgeEnds
        .filter((edge) => edge.traceId === traceId)
        .map((edge) => `edge-end:${edge.id}:${edge.endedAt}`),
    ].sort();

    return `log.trace.ingested:${data.userId}:${traceId}:${parts.join("|")}`;
  }
}


import { Logger } from "tslog";
import { ConflictError } from "../../../../common/types";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { InternalTracer } from "../../../../infra/tracing/InternalTracer";
import { ILogService } from "../../api/ILogService";
import {
  IngestEdgeStart,
  IngestNodeStart,
  IngestNodeEnd,
  IngestEdgeEnd,
  IngestTraceStart,
  ProjectedFlowResult,
  ReadTraceSummary,
  TraceListResult,
} from "../../api/types";
import { createLogWriteRepo, createLogReadRepo } from "../repo";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { LogFlowProjector } from "../projection/LogFlowProjector";
import { decodeCursor, encodeCursor } from "../util/CursorCodec";

/**
 * Default upper limits for row queries when projecting flows.
 */
const DEFAULT_PROJECTION_NODE_CAP = 500;
const MAX_PROJECTION_NODE_CAP = 1000;
const DEFAULT_TRACE_LIST_LIMIT = 20;
const MAX_TRACE_LIST_LIMIT = 100;

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
  readonly projector: LogFlowProjector;

  constructor(
    logger: Logger<unknown>,
    eventBus: IEventBus,
    writeRepo?: ILogWriteRepo,
    readRepo?: ILogReadRepo,
    projector?: LogFlowProjector,
  ) {
    super();
    this.logger = logger.getSubLogger({ name: "LogServiceImpl" });
    this.eventBus = eventBus;
    this.writeRepo = writeRepo ?? createLogWriteRepo(this.logger);
    this.readRepo = readRepo ?? createLogReadRepo(this.logger);
    this.projector = projector ?? new LogFlowProjector();
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
    traceStarts: IngestTraceStart[];
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    this.logger.trace("ingestNodesNEdges", {
      userId: data.userId,
      traceStarts: data.traceStarts.length,
      nodeStarts: data.nodeStarts.length,
      edgeStarts: data.edgeStarts.length,
      nodeEnds: data.nodeEnds.length,
      edgeEnds: data.edgeEnds.length,
    });

    try {
      this.validateEdgeStarts(data.edgeStarts);
      
    const totalEvents =
      data.traceStarts.length +
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
      await InternalTracer.trace(
        "eventBus.publish log.telemetry.received",
        () => this.eventBus.publish(
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
        ),
        { type: "eventbus", importanceLevel: 1 }
      );
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  /**
   * Projects a trace flow filtered by importance threshold.
   * Steps:
   * 1. Loads nodes from the read-optimized tables within a maximum read cap.
   * 2. Loads visible edges linking those loaded nodes within a cap.
   * 3. Invokes the LogFlowProjector utility to collapse hidden nodes into ghost nodes.
   */
  // fallow-ignore-next-line complexity
  async projectTraceFlow(data: {
    userId: string;
    traceId: string;
    threshold: number;
    cursor?: string;
    limit?: number;
  }): Promise<ProjectedFlowResult> {
    const { userId, traceId, threshold, cursor, limit: providedLimit } = data;

    const limit = Math.min(providedLimit ?? DEFAULT_PROJECTION_NODE_CAP, MAX_PROJECTION_NODE_CAP);

    const summary = await InternalTracer.trace(
      "loadTraceSummary",
      () => this.readRepo.loadTraceSummary({ userId, traceId }),
      { type: "db", importanceLevel: 1 }
    );
    if (!summary) {
      throw new Error("Trace not found");
    }

    let offset = 0;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded.materializedAt !== summary.materializedAt) {
        throw new ConflictError(
          `Cursor is stale. Cursor refers to materialization at ${decoded.materializedAt}, but latest is ${summary.materializedAt}. Please refresh.`
        );
      }
      offset = decoded.offset;
    }

    // Load nodes and edges under hard limits (safety caps) to prevent memory exhaust
    const boundedNodes = await InternalTracer.trace(
      "loadBoundedProjectionNodes",
      () => this.readRepo.loadBoundedProjectionNodes({
        userId,
        traceId,
        paging: { offset, limit },
      }),
      { type: "db", importanceLevel: 1 }
    );

    const boundedEdges = await InternalTracer.trace(
      "loadBoundedVisibleEdges",
      () => this.readRepo.loadBoundedVisibleEdges({
        userId,
        traceId,
        nodeIds: boundedNodes.items.map((node) => node.id),
      }),
      { type: "db", importanceLevel: 1 }
    );

    // Run local CPU projection rules to calculate visible normal and ghost nodes
    const result = await InternalTracer.trace(
      "projector.project",
      () => this.projector.project({
        userId,
        traceId,
        threshold,
        nodes: boundedNodes.items,
        edges: boundedEdges.edges,
        nodeCap: {
          cap: limit,
          returnedCount: boundedNodes.items.length,
          capHit: boundedNodes.hasMore,
        },
        edgeCap: boundedEdges.cap,
      }),
      { type: "cpu", importanceLevel: 2 }
    );

    // Enrich metadata with paging information
    const hasAfter = boundedNodes.hasMore;
    const hasBefore = offset > 0;

    result.metadata.paging = {
      hasAfter,
      hasBefore,
      nextCursor: hasAfter ? encodeCursor(offset + limit, summary.materializedAt) : null,
      previousCursor: hasBefore ? encodeCursor(Math.max(0, offset - limit), summary.materializedAt) : null,
      totalNodeCount: summary.nodeCount,
      fromFlowOrder: boundedNodes.items.length > 0 ? boundedNodes.items[0].flowOrder : 0,
      toFlowOrder: boundedNodes.items.length > 0 ? boundedNodes.items[boundedNodes.items.length - 1].flowOrder : 0,
    };

    this.logger.trace("projectTraceFlow", {
      userId,
      traceId,
      threshold,
      offset,
      limit,
      returnedNodeCount: result.metadata.returnedNodeCount,
      returnedEdgeCount: result.metadata.returnedEdgeCount,
      visibleNodeCount: result.metadata.visibleNodeCount,
      ghostNodeCount: result.metadata.ghostNodeCount,
      nodeCapHit: result.metadata.nodeCap.capHit,
      edgeCapHit: result.metadata.edgeCap.capHit,
      omittedEdgeCount: result.metadata.omittedEdgeCount,
      hasAfter,
      hasBefore,
    });

    return result;
  }

  /**
   * Returns a bounded page of latest materialized trace summaries.
   */
  async listTraces(data: {
    userId: string;
    page?: number;
    limit?: number;
  }): Promise<TraceListResult> {
    const page = Math.max(1, Math.floor(data.page ?? 1));
    const limit = Math.min(
      MAX_TRACE_LIST_LIMIT,
      Math.max(1, Math.floor(data.limit ?? DEFAULT_TRACE_LIST_LIMIT)),
    );
    const offset = (page - 1) * limit;

    const result = await InternalTracer.trace(
      "loadTraceSummaries",
      () => this.readRepo.loadTraceSummaries({
        userId: data.userId,
        paging: { offset, limit },
      }),
      { type: "db", importanceLevel: 1 },
    );
    const totalPages = result.totalCount === 0
      ? 0
      : Math.ceil(result.totalCount / limit);

    return {
      traces: result.items,
      totalCount: result.totalCount,
      page,
      limit,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: result.hasMore,
    };
  }

  /**
   * Retrieves the latest summary statistics and diagnostics for a trace.
   */
  async getTraceSummary(data: {
    userId: string;
    traceId: string;
  }): Promise<ReadTraceSummary | null> {
    this.logger.trace("getTraceSummary", { userId: data.userId, traceId: data.traceId });
    return this.readRepo.loadTraceSummary(data);
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
    traceStarts: IngestTraceStart[];
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): string {
    const parts = [
      ...data.traceStarts.map((trace) => `trace-start:${trace.traceId}:${trace.timestamp}`),
      ...data.nodeStarts.map((node) => `n-start:${node.id}`),
      ...data.nodeEnds.map((node) => `n-end:${node.id}`),
      ...data.edgeStarts.map((edge) => `e-start:${edge.id}`),
      ...data.edgeEnds.map((edge) => `e-end:${edge.id}`),
    ].sort();

    return `log.telemetry.received:${data.userId}:${parts.join("|")}`;
  }
}

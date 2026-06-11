import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
  ProjectedFlowResult,
  ReadTraceSummary,
  TraceListResult,
} from "./types";

/**
 * Interface contract for the Log Service.
 * Exposes public trace ingestion and visualization features.
 * Following code-base.md guidelines:
 * - Decouples HTTP handlers (routes) from real log orchestration.
 * - Utilizes standard object parameters on all public methods.
 * - Restricts database and event-bus details behind the implementation boundary.
 */
export abstract class ILogService {
  /**
   * Batch ingests lifecycle events for nodes and edges (starts/ends).
   * 
   * @param data.userId - ID of the user owning these traces.
   * @param data.nodeStarts - Array of node start events.
   * @param data.edgeStarts - Array of edge start events.
   * @param data.nodeEnds - Array of node end/resolution events.
   * @param data.edgeEnds - Array of edge end/resolution events.
   */
  abstract ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;

  /**
   * Projects a read-optimized trace flow bounded by a specific importance threshold.
   * 
   * @param data.userId - Owner of the trace (for multi-tenant safety).
   * @param data.traceId - Target trace ID to fetch.
   * @param data.threshold - Maximum importance level to include in the projected flow window.
   * @param data.cursor - Optional cursor for stable paging.
   * @param data.limit - Optional maximum number of nodes to return in this result.
   * @returns Bounded flow projection with nodes, edges, and flow diagnostics.
   */
  abstract projectTraceFlow(data: {
    userId: string;
    traceId: string;
    threshold: number;
    cursor?: string;
    limit?: number;
  }): Promise<ProjectedFlowResult>;

  /**
   * Lists materialized trace summaries for a user using bounded pagination.
   */
  abstract listTraces(data: {
    userId: string;
    page?: number;
    limit?: number;
  }): Promise<TraceListResult>;

  /**
   * Retrieves the latest summary statistics and diagnostics for a trace.
   */
  abstract getTraceSummary(data: {
    userId: string;
    traceId: string;
  }): Promise<ReadTraceSummary | null>;
}

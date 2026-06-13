import {
  ReadCheckpoint,
  ReadNode,
  ReadEdge,
  ReadTraceSummary,
  BoundedVisibleEdgesResult,
  PagingParams,
  PagedResult,
} from "../../api/types";
import { NodeEventRow, EdgeEventRow, TraceEventRow } from "./types";

/**
 * Default upper limits for row queries when projecting flows.
 * Prevents returning excessive rows which would crash memory or UI rendering.
 */
export const DEFAULT_PROJECTION_NODE_CAP = 500;
export const DEFAULT_PROJECTION_EDGE_CAP = 2000;

/**
 * Interface contract for the Log Read Repository.
 * Following code-base.md guidelines:
 * - Decouples service logic from database clients (like ClickHouse).
 * - Declares methods for reading checkpoints, raw events, read models, and projected flow segments.
 * - Uses object parameters on all methods.
 */
export abstract class ILogReadRepo {
  /**
   * Retrieves the latest processed checkpoint for a trace.
   * Checkpoints store offset values to resume incremental materialization safely.
   */
  abstract loadCheckpoint(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null>;

  /**
   * Loads the materialized read-model elements (nodes, edges, and summary) for a trace.
   */
  abstract loadTraceEventsAfterCheckpoint(params: { userId: string, traceId: string, checkpoint: ReadCheckpoint | null }): Promise<TraceEventRow[]>;

  /**\n   * Loads the materialized read-model elements (nodes, edges, and summary) for a trace.\n   */
  abstract loadLatestReadModel(params: {
    userId: string;
    traceId: string;
  }): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }>;

  /**
   * Reads raw events appended since the provided checkpoint.
   * Replayed by the materializer to perform incremental updates.
   */
  abstract loadRawEventsAfterCheckpoint(params: {
    userId: string;
    traceId: string;
    checkpoint: ReadCheckpoint | null;
  }): Promise<{
    nodeEvents: NodeEventRow[];
    edgeEvents: EdgeEventRow[];
  }>;

  /**
   * Saves or overwrites the materialized read-optimized projections of a trace.
   */
  abstract saveReadModel(params: {
    userId: string;
    traceId: string;
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary;
    materializedAt: number;
  }): Promise<void>;

  /**
   * Persists a new checkpoint representing materialization progress.
   */
  abstract saveCheckpoint(params: {
    checkpoint: ReadCheckpoint;
  }): Promise<void>;

  /**
   * Queries materialized nodes filtered by a given importance threshold.
   * Output is bounded by PagingParams.limit.
   */
  abstract loadBoundedVisibleNodes(params: {
    userId: string;
    traceId: string;
    threshold: number;
    paging: PagingParams;
  }): Promise<PagedResult<ReadNode>>;

  /**
   * Queries materialized edges connecting a specific list of nodes.
   * Output is bounded by DEFAULT_PROJECTION_EDGE_CAP.
   */
  abstract loadBoundedVisibleEdges(params: {
    userId: string;
    traceId: string;
    nodeIds: string[];
  }): Promise<BoundedVisibleEdgesResult>;

  /**
   * Loads all materialized nodes for a trace, up to the safety cap in paging.
   * Used as the first pass during threshold-based sub-flow projection.
   */
  abstract loadBoundedProjectionNodes(params: {
    userId: string;
    traceId: string;
    paging: PagingParams;
  }): Promise<PagedResult<ReadNode>>;

  /**
   * Loads the latest summary for a trace.
   */
  abstract loadTraceSummary(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadTraceSummary | null>;

  /**
   * Filter criteria for trace summaries.
   */
  abstract loadTraceSummaries(params: {
    userId: string;
    paging: PagingParams;
    filter?: {
      excludeInternal?: boolean;
    };
  }): Promise<PagedResult<ReadTraceSummary>>;
}

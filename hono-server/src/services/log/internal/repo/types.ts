/**
 * Database row structures (snake_case) to decouple database schema from public API types.
 */

/**
 * ClickHouse row structure for trace start events.
 */
export type TraceEventRow = {
  user_id: string;
  trace_id: string;
  event_type: number; // 0 = start
  name: string | null;
  importance_labels: Record<number, string>;
  timestamp_ms: number;
};

/**
 * ClickHouse row structure for raw node events (starts/ends).
 */
export type NodeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1; // 0 for Start, 1 for End
  started_at_ms: number | null;
  ended_at_ms: number | null;
  node_type: string | null;
  data: Record<string, string>;
  message: string | null;
  importance_level: number | null;
};

/**
 * ClickHouse row structure for raw edge events.
 */
export type EdgeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1; // 0 for Start, 1 for End
  started_at_ms: number | null;
  ended_at_ms: number | null;
  edge_type: string | null;
  from_node_id: string | null;
  to_node_id: string | null;
  data: Record<string, string>;
};

/**
 * ClickHouse row structure for materialized read-optimized nodes.
 */
export type ReadNodeRow = {
  id: string;
  user_id: string;
  trace_id: string;
  node_type: string;
  data: Record<string, string>;
  started_at_ms: number;
  ended_at_ms: number | null;
  original_started_at_ms: number;
  clock_skew_ms: number;
  start_message: string | null;
  end_message: string | null;
  importance_level: number;
  flow_order: number;
  materialized_at_ms: number;
};

/**
 * ClickHouse row structure for materialized read-optimized edges.
 */
export type ReadEdgeRow = {
  id: string;
  user_id: string;
  trace_id: string;
  edge_type: string;
  from_node_id: string;
  to_node_id: string;
  from_flow_order: number;
  to_flow_order: number;
  data: Record<string, string>;
  started_at_ms: number;
  ended_at_ms: number | null;
  original_started_at_ms: number;
  clock_skew_ms: number;
  materialized_at_ms: number;
};

/**
 * ClickHouse row structure for trace summaries and aggregates.
 */
export type TraceSummaryRow = {
  user_id: string;
  trace_id: string;
  name: string | null;
  importance_labels: Record<number, string>;
  node_count: number;
  edge_count: number;
  min_importance_level: number;
  max_importance_level: number;
  started_at_ms: number;
  ended_at_ms: number | null;
  materialized_at_ms: number;

  diagnostic_missing_starts_count: number;
  diagnostic_missing_ends_count: number;
  diagnostic_negative_duration_count: number;
  diagnostic_cycle_count: number;
  diagnostic_orphan_edge_count: number;
  diagnostic_invalid_importance_count: number;
  diagnostic_clock_skew_count: number;
  diagnostic_limit_exceeded_count: number;
};

/**
 * ClickHouse row structure for progress tracking checkpoints.
 */
export type ReadCheckpointRow = {
  user_id: string;
  trace_id: string;

  trace_progress_timestamp: number;
  node_progress_timestamp: number;
  node_progress_id: string;
  node_progress_event_type: number;

  edge_progress_timestamp: number;
  edge_progress_id: string;
  edge_progress_event_type: number;

  updated_at_ms: number;
};

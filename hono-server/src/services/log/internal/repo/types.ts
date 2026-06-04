export type NodeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  node_type: string | null;
  data: Record<string, string>;
  message: string | null;
  importance_level: number | null;
};

export type EdgeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  edge_type: string | null;
  from_node_id: string | null;
  to_node_id: string | null;
  data: Record<string, string>;
};

export type ReadNodeRow = {
  id: string;
  user_id: string;
  trace_id: string;
  node_type: string;
  data: Record<string, string>;
  started_at_ms: number;
  ended_at_ms: number | null;
  start_message: string | null;
  end_message: string | null;
  importance_level: number;
  flow_order: number;
  materialized_at_ms: number;
};

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
  materialized_at_ms: number;
};

export type TraceSummaryRow = {
  user_id: string;
  trace_id: string;
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
};

export type ReadCheckpointRow = {
  user_id: string;
  trace_id: string;

  node_progress_timestamp: number;
  node_progress_id: string;
  node_progress_event_type: number;

  edge_progress_timestamp: number;
  edge_progress_id: string;
  edge_progress_event_type: number;

  updated_at_ms: number;
};

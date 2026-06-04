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

  diag_missing_starts: number;
  diag_missing_ends: number;
  diag_negative_durations: number;
  diag_cycles: number;
  diag_orphan_edges: number;
  diag_invalid_importance: number;
  diag_clock_skew: number;
};

export type ReadCheckpointRow = {
  user_id: string;
  trace_id: string;

  last_node_event_time: number;
  last_node_event_id: string;
  last_node_event_type: number;

  last_edge_event_time: number;
  last_edge_event_id: string;
  last_edge_event_type: number;

  checkpointed_at_ms: number;
};

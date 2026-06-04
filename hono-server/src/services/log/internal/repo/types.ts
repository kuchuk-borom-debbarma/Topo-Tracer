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

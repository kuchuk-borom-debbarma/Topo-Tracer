export type NodeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  timestamp_ms: number;
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
  timestamp_ms: number;
  edge_type: string | null;
};

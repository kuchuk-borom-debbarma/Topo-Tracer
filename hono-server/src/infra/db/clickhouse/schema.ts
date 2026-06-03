export const CLICKHOUSE_NODE_EVENTS_TABLE = "node_events";
export const CLICKHOUSE_EDGE_EVENTS_TABLE = "edge_events";

export const CLICKHOUSE_CREATE_NODE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_NODE_EVENTS_TABLE}
(
  id String COMMENT 'Node id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  timestamp_ms UInt64 COMMENT 'UTC timestamp in milliseconds for the start or end event',
  node_type Nullable(String) COMMENT 'Node type for start events; null for end events when not provided',
  data Map(String, String) COMMENT 'String key/value payload captured for node start events',
  message Nullable(String) COMMENT 'Start or end message associated with the event',
  importance_level Nullable(Int32) COMMENT 'Node importance level for start events'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, timestamp_ms, event_type);
`;

export const CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_EDGE_EVENTS_TABLE}
(
  id String COMMENT 'Edge id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  timestamp_ms UInt64 COMMENT 'UTC timestamp in milliseconds for the start or end event',
  edge_type Nullable(String) COMMENT 'Edge type for start events; null for end events when not provided'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, timestamp_ms, event_type);
`;

export const CLICKHOUSE_SCHEMA_STATEMENTS = [
  CLICKHOUSE_CREATE_NODE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE,
] as const;

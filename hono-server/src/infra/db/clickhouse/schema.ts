export const CLICKHOUSE_NODE_EVENTS_TABLE = 'node_events';
export const CLICKHOUSE_EDGE_EVENTS_TABLE = 'edge_events';
export const CLICKHOUSE_TRACE_EVENTS_TABLE = 'trace_events';
export const CLICKHOUSE_READ_NODES_TABLE = 'read_nodes';
export const CLICKHOUSE_READ_EDGES_TABLE = 'read_edges';
export const CLICKHOUSE_TRACE_SUMMARIES_TABLE = 'trace_summaries';
export const CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE = 'materialization_checkpoints';

export const CLICKHOUSE_CREATE_NODE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_NODE_EVENTS_TABLE}
(
  id String COMMENT 'Node id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  started_at_ms Nullable(UInt64) COMMENT 'UTC start timestamp in milliseconds for start events; null for end events',
  ended_at_ms Nullable(UInt64) COMMENT 'UTC end timestamp in milliseconds for end events; null for start events',
  node_type Nullable(String) COMMENT 'Node type for start events; null for end events when not provided',
  data Map(String, String) COMMENT 'String key/value payload captured for node start events',
  message Nullable(String) COMMENT 'Start or end message associated with the event',
  importance_level Nullable(Int32) COMMENT 'Node importance level for start events',
  name Nullable(String) COMMENT 'Human-friendly code artifact name (e.g. ClassName.methodName(Args))'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, event_type);
`;

export const CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_EDGE_EVENTS_TABLE}
(
  id String COMMENT 'Edge id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  started_at_ms Nullable(UInt64) COMMENT 'UTC start timestamp in milliseconds for start events; null for end events',
  ended_at_ms Nullable(UInt64) COMMENT 'UTC end timestamp in milliseconds for end events; null for start events',
  edge_type Nullable(String) COMMENT 'Edge type for start events; null for end events when not provided',
  from_node_id Nullable(String) COMMENT 'Source node id for edge start events; null for end events',
  to_node_id Nullable(String) COMMENT 'Target node id for edge start events; null for end events',
  data Map(String, String) COMMENT 'String key/value payload captured for edge start events'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, event_type);
`;

export const CLICKHOUSE_CREATE_TRACE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_TRACE_EVENTS_TABLE}
(
  user_id String COMMENT 'User id that owns the trace',
  trace_id String COMMENT 'Unique trace id',
  event_type UInt8 COMMENT 'Event kind: 0 = start',
  name Nullable(String) COMMENT 'Optional SDK-provided name for the trace',
  importance_labels Map(Int32, String) COMMENT 'Optional mapping of importance levels to human-readable labels',
  timestamp_ms UInt64 COMMENT 'UTC timestamp in milliseconds'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, timestamp_ms);
`;

/**
 * Stores versioned latest read-optimized node state.
 */
export const CLICKHOUSE_CREATE_READ_NODES_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_READ_NODES_TABLE}
(
  id String COMMENT 'Node id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  importance_level Int32 COMMENT 'Node importance level (higher is more important)',
  flow_order Int32 COMMENT 'Deterministic execution order within the trace',
  started_at_ms UInt64 COMMENT 'UTC start timestamp in milliseconds',
  ended_at_ms Nullable(UInt64) COMMENT 'UTC end timestamp in milliseconds; null if not finished',
  original_started_at_ms UInt64 COMMENT 'Original UTC start timestamp before clock-skew correction',
  clock_skew_ms Int64 COMMENT 'Applied clock-skew correction in milliseconds',
  node_type String COMMENT 'Categorical type of the node',
  data Map(String, String) COMMENT 'Merged key/value payload from node lifecycle events',
  start_message Nullable(String) COMMENT 'Message captured at node start',
  end_message Nullable(String) COMMENT 'Message captured at node end',
  materialized_at_ms UInt64 COMMENT 'Version field: materialization timestamp in milliseconds',
  name Nullable(String) COMMENT 'Human-friendly code artifact name propagated from node start event'
)
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id, id);
`;

/**
 * Stores versioned latest read-optimized edge state.
 */
export const CLICKHOUSE_CREATE_READ_EDGES_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_READ_EDGES_TABLE}
(
  id String COMMENT 'Edge id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  from_node_id String COMMENT 'Source node id',
  to_node_id String COMMENT 'Target node id',
  from_flow_order Int32 COMMENT 'Denormalized flow order of the source node',
  to_flow_order Int32 COMMENT 'Denormalized flow order of the target node',
  edge_type String COMMENT 'Categorical type of the edge',
  started_at_ms UInt64 COMMENT 'UTC start timestamp in milliseconds',
  ended_at_ms Nullable(UInt64) COMMENT 'UTC end timestamp in milliseconds; null if not finished',
  original_started_at_ms UInt64 COMMENT 'Original UTC start timestamp before clock-skew correction',
  clock_skew_ms Int64 COMMENT 'Applied clock-skew correction in milliseconds',
  data Map(String, String) COMMENT 'Merged key/value payload from edge lifecycle events',
  materialized_at_ms UInt64 COMMENT 'Version field: materialization timestamp in milliseconds'
)
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id, id);
`;

/**
 * Stores versioned trace-level summaries and diagnostics.
 */
export const CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_TRACE_SUMMARIES_TABLE}
(
  user_id String COMMENT 'User id that owns the trace',
  trace_id String COMMENT 'Unique trace id',
  name Nullable(String) COMMENT 'Optional SDK-provided name for the trace',
  importance_labels Map(Int32, String) COMMENT 'Mapping of importance levels to human-readable labels',
  node_count UInt32 COMMENT 'Total number of nodes discovered in the trace',
  edge_count UInt32 COMMENT 'Total number of edges discovered in the trace',
  min_importance_level Int32 COMMENT 'Minimum importance level found in any node',
  max_importance_level Int32 COMMENT 'Maximum importance level found in any node',
  started_at_ms UInt64 COMMENT 'Earliest start timestamp in the trace',
  ended_at_ms Nullable(UInt64) COMMENT 'Latest end timestamp in the trace; null if any part unfinished',
  materialized_at_ms UInt64 COMMENT 'Version field: materialization timestamp in milliseconds',
  diagnostic_missing_starts_count UInt32 COMMENT 'Count of end events with no matching start',
  diagnostic_missing_ends_count UInt32 COMMENT 'Count of nodes/edges that never finished',
  diagnostic_negative_duration_count UInt32 COMMENT 'Count of events where end < start',
  diagnostic_cycle_count UInt32 COMMENT 'Count of detected cycles in the flow',
  diagnostic_orphan_edge_count UInt32 COMMENT 'Count of edges pointing to missing nodes',
  diagnostic_invalid_importance_count UInt32 COMMENT 'Count of nodes with importance outside expected range',
  diagnostic_clock_skew_count UInt32 COMMENT 'Count of events appearing before their logical cause',
  diagnostic_limit_exceeded_count UInt32 COMMENT 'Count of events dropped due to size or complexity limits'
)
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id);
`;

/**
 * Stores exact materialization progress bookmarks for raw event sources.
 */
export const CLICKHOUSE_CREATE_MATERIALIZATION_CHECKPOINTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE}
(
  user_id String COMMENT 'User id that owns the trace',
  trace_id String COMMENT 'Unique trace id',
  trace_progress_timestamp UInt64 COMMENT 'Raw trace stream: last processed timestamp',
  node_progress_timestamp UInt64 COMMENT 'Raw node stream: last processed started_at_ms or ended_at_ms',
  node_progress_id String COMMENT 'Raw node stream: tie-breaker id of the last processed event',
  node_progress_event_type UInt8 COMMENT 'Raw node stream: tie-breaker event type of the last processed event',
  edge_progress_timestamp UInt64 COMMENT 'Raw edge stream: last processed started_at_ms or ended_at_ms',
  edge_progress_id String COMMENT 'Raw edge stream: tie-breaker id of the last processed event',
  edge_progress_event_type UInt8 COMMENT 'Raw edge stream: tie-breaker event type of the last processed event',
  updated_at_ms UInt64 COMMENT 'Version field: checkpoint write timestamp'
)
ENGINE = ReplacingMergeTree(updated_at_ms)
ORDER BY (user_id, trace_id);
`;

export const CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE = 'trace_summaries_realtime';
export const CLICKHOUSE_NODE_EVENTS_SUMMARY_MV = 'node_events_summary_mv';
export const CLICKHOUSE_EDGE_EVENTS_SUMMARY_MV = 'edge_events_summary_mv';

export const CLICKHOUSE_CREATE_TRACE_SUMMARIES_REALTIME_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE}
(
  user_id String COMMENT 'User id that owns the trace',
  trace_id String COMMENT 'Unique trace id',
  node_count SimpleAggregateFunction(sum, UInt64) COMMENT 'Real-time count of distinct nodes',
  edge_count SimpleAggregateFunction(sum, UInt64) COMMENT 'Real-time count of distinct edges',
  min_importance_level SimpleAggregateFunction(min, Nullable(Int32)) COMMENT 'Minimum importance level found',
  max_importance_level SimpleAggregateFunction(max, Nullable(Int32)) COMMENT 'Maximum importance level found',
  started_at_ms SimpleAggregateFunction(min, Nullable(UInt64)) COMMENT 'Earliest start timestamp',
  ended_at_ms SimpleAggregateFunction(max, Nullable(UInt64)) COMMENT 'Latest end timestamp',
  updated_at_ms SimpleAggregateFunction(max, Nullable(UInt64)) COMMENT 'Latest event update timestamp'
)
ENGINE = AggregatingMergeTree()
ORDER BY (user_id, trace_id);
`;

export const CLICKHOUSE_CREATE_NODE_EVENTS_SUMMARY_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${CLICKHOUSE_NODE_EVENTS_SUMMARY_MV}
TO ${CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE}
AS SELECT
  user_id,
  trace_id,
  toUInt64(countIf(id, event_type = 0)) as node_count,
  toUInt64(0) as edge_count,
  minIf(importance_level, event_type = 0) as min_importance_level,
  maxIf(importance_level, event_type = 0) as max_importance_level,
  minIf(started_at_ms, event_type = 0) as started_at_ms,
  maxIf(ended_at_ms, event_type = 1) as ended_at_ms,
  max(if(event_type = 0, ${CLICKHOUSE_NODE_EVENTS_TABLE}.started_at_ms, ${CLICKHOUSE_NODE_EVENTS_TABLE}.ended_at_ms)) as updated_at_ms
FROM ${CLICKHOUSE_NODE_EVENTS_TABLE}
GROUP BY user_id, trace_id;
`;

export const CLICKHOUSE_CREATE_EDGE_EVENTS_SUMMARY_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${CLICKHOUSE_EDGE_EVENTS_SUMMARY_MV}
TO ${CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE}
AS SELECT
  user_id,
  trace_id,
  toUInt64(0) as node_count,
  toUInt64(countIf(id, event_type = 0)) as edge_count,
  cast(null, 'Nullable(Int32)') as min_importance_level,
  cast(null, 'Nullable(Int32)') as max_importance_level,
  minIf(started_at_ms, event_type = 0) as started_at_ms,
  maxIf(ended_at_ms, event_type = 1) as ended_at_ms,
  max(if(event_type = 0, ${CLICKHOUSE_EDGE_EVENTS_TABLE}.started_at_ms, ${CLICKHOUSE_EDGE_EVENTS_TABLE}.ended_at_ms)) as updated_at_ms
FROM ${CLICKHOUSE_EDGE_EVENTS_TABLE}
GROUP BY user_id, trace_id;
`;

export const CLICKHOUSE_SCHEMA_STATEMENTS = [
  CLICKHOUSE_CREATE_NODE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_TRACE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_READ_NODES_TABLE,
  CLICKHOUSE_CREATE_READ_EDGES_TABLE,
  CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_CREATE_MATERIALIZATION_CHECKPOINTS_TABLE,
  CLICKHOUSE_CREATE_TRACE_SUMMARIES_REALTIME_TABLE,
  CLICKHOUSE_CREATE_NODE_EVENTS_SUMMARY_MV,
  CLICKHOUSE_CREATE_EDGE_EVENTS_SUMMARY_MV,
] as const;

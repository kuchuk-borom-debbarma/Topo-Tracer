# Backend Schema And Queries

Source:

- `carno.js/src/infra/ClickHouseService.ts`
- `carno.js/src/infra/events/EventBus.ts`
- `carno.js/src/infra/events/InMemoryEventBus.ts`
- `carno.js/src/services/log/contracts.ts`
- `carno.js/src/services/log/RawEventRepository.ts`
- `carno.js/src/services/log/ReadModelRepository.ts`
- `carno.js/src/services/log/TraceReadModelBuilder.ts`
- `carno.js/src/services/log/worker/TraceReadModelWorker.ts`

## Backend Shape

Layers:

1. Controller accepts telemetry and graph reads.
2. `LogService` validates and coordinates app flow.
3. `RawEventRepository` appends immutable raw events.
4. `EventBus` publishes `trace.events.ingested`.
5. `TraceReadModelWorker` subscribes, batches dirty trace ids, and materializes.
6. `ReadModelRepository` serves optimized graph reads.

Event bus owns idempotency. App code passes domain events; the current
`InMemoryEventBus` dedupes by `idempotencyKey` for a TTL. Kafka can later
replace it behind the same contract.

## Contracts

Contracts live in `services/log/contracts.ts` and `infra/events/EventBus.ts`:

- `EventBusPort`
- `RawEventStore`
- `TraceReadModelStore`
- `TraceReadModelProjector`
- `TraceLogService`

Carno injects class tokens, so `EventBus` is the runtime token and
`InMemoryEventBus` is the dev provider.

## Raw Events

Table: `topo_tracer.node_trace_events`

```sql
CREATE TABLE IF NOT EXISTS topo_tracer.node_trace_events (
  trace_id String,
  event_id String,
  entity_id String,
  entity_type LowCardinality(String),
  event_type LowCardinality(String),
  occurred_at_ms Int64,
  received_at_ms Int64,
  name Nullable(String),
  importance_level Nullable(Int32),
  parent_id Nullable(String),
  from_node_id Nullable(String),
  to_node_id Nullable(String),
  label Nullable(String),
  status Nullable(String),
  data String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(received_at_ms / 1000))
ORDER BY (trace_id, received_at_ms, event_id);
```

Notes:

- Raw history is append-only.
- `event_id` is retry/idempotency identity.
- Replay collapses duplicate event ids with `argMax`.
- `received_at_ms` gives deterministic backend ordering.
- `occurred_at_ms` is source time for durations.

Replay query:

```sql
SELECT
  event_id,
  {traceId:String} AS trace_id,
  argMax(entity_id, received_at_ms) AS entity_id,
  argMax(entity_type, received_at_ms) AS entity_type,
  argMax(event_type, received_at_ms) AS event_type,
  argMax(occurred_at_ms, received_at_ms) AS occurred_at_ms,
  max(received_at_ms) AS received_at_ms,
  min(received_at_ms) AS first_received_at_ms,
  argMax(name, received_at_ms) AS name,
  argMax(importance_level, received_at_ms) AS importance_level,
  argMax(parent_id, received_at_ms) AS parent_id,
  argMax(from_node_id, received_at_ms) AS from_node_id,
  argMax(to_node_id, received_at_ms) AS to_node_id,
  argMax(label, received_at_ms) AS label,
  argMax(status, received_at_ms) AS status,
  argMax(data, received_at_ms) AS data
FROM topo_tracer.node_trace_events
WHERE trace_id = {traceId:String}
GROUP BY event_id
ORDER BY first_received_at_ms ASC, event_id ASC
```

Dirty trace recovery query:

```sql
SELECT raw.trace_id
FROM (
  SELECT trace_id, max(received_at_ms) AS latest_event_at
  FROM topo_tracer.node_trace_events
  GROUP BY trace_id
) AS raw
LEFT JOIN (
  SELECT trace_id, max(materialized_at_ms) AS latest_materialized_at
  FROM topo_tracer.node_trace_summary
  GROUP BY trace_id
) AS summary USING trace_id
WHERE latest_materialized_at IS NULL OR latest_event_at > latest_materialized_at
ORDER BY latest_event_at ASC
LIMIT {limit:UInt32}
```

This scan is recovery only. Normal path is event-driven.

## Read Nodes

Table: `topo_tracer.node_read_nodes`

```sql
CREATE TABLE IF NOT EXISTS topo_tracer.node_read_nodes (
  trace_id String,
  id String,
  parent_id Nullable(String),
  name String,
  importance_level Int32,
  status LowCardinality(String),
  started_at_ms Nullable(Int64),
  ended_at_ms Nullable(Int64),
  duration_ms Nullable(Int64),
  ancestry_path Array(String),
  indent_level Int32,
  flow_order Int64,
  diagnostics Array(String),
  data String,
  materialized_at_ms Int64
) ENGINE = ReplacingMergeTree(materialized_at_ms)
PARTITION BY sipHash64(trace_id) % 32
ORDER BY (trace_id, id);
```

Read query:

```sql
SELECT
  trace_id,
  id,
  argMax(parent_id, materialized_at_ms) AS parent_id,
  argMax(name, materialized_at_ms) AS name,
  argMax(importance_level, materialized_at_ms) AS importance_level,
  argMax(status, materialized_at_ms) AS status,
  argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
  argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
  argMax(duration_ms, materialized_at_ms) AS duration_ms,
  argMax(ancestry_path, materialized_at_ms) AS ancestry_path,
  argMax(indent_level, materialized_at_ms) AS indent_level,
  argMax(flow_order, materialized_at_ms) AS flow_order,
  argMax(diagnostics, materialized_at_ms) AS diagnostics,
  argMax(data, materialized_at_ms) AS data,
  max(materialized_at_ms) AS latest_materialized_at_ms
FROM topo_tracer.node_read_nodes
WHERE trace_id = {traceId:String}
GROUP BY trace_id, id
ORDER BY flow_order ASC, id ASC
```

ClickHouse alias rule:

- Do not alias aggregate outputs back to source column names inside the same
  aggregate `SELECT`.
- Use private aggregate aliases such as `latest_materialized_at_ms`, then map
  them to API field names from an outer non-aggregate `SELECT`.
- This avoids alias substitution turning expressions like
  `argMax(..., materialized_at_ms)` into nested aggregates.

Why no `FINAL`:

- Query groups by logical identity.
- `argMax` returns latest materialized fields.
- Old rows with stale `flow_order` cannot duplicate nodes.

Why `ancestry_path Array(String)` lives here:

- Graph projection needs nearest visible ancestor for hidden nodes.
- ClickHouse array functions (`arrayReverse`, `arrayFirst`, `has`) can compute
  that inside one trace-scoped query.
- Keeping ancestry on each node avoids an extra join and avoids writing one
  extra row per ancestor hop.
- Separate ancestry index table was removed because current reads did not use
  it. It added write amplification without a measurable read benefit.

Path semantics:

| node shape | `parent_id` | `ancestry_path` |
| --- | --- | --- |
| root | `NULL` | `[]` |
| child of root | root id | `[root id]` |
| grandchild | parent id | `[root id, parent id]` |

Nearest visible ancestor SQL pattern:

```sql
arrayFirst(
  ancestor_id -> has(visible_ids.ids, ancestor_id),
  arrayReverse(latest_nodes.ancestry_path)
) AS nearest_visible_ancestor_id
```

`arrayReverse` matters because direct parent should win over root. If no
ancestor is visible, ClickHouse returns empty string for `String`, and projection
normalizes that to `__root__`.

Why edges do not have ancestry arrays:

- Edge projection resolves through endpoint nodes.
- Endpoint nodes already carry ancestry.
- Storing edge ancestry would duplicate derived state and create invalidation
  work every time node parentage/materialization changes.
- Add edge ancestry only if a future query needs path-aware edge analytics that
  cannot be answered through endpoint node joins.

## Read Edges

Table: `topo_tracer.node_read_edges`

```sql
CREATE TABLE IF NOT EXISTS topo_tracer.node_read_edges (
  trace_id String,
  id String,
  from_node_id String,
  to_node_id String,
  label String,
  status LowCardinality(String),
  started_at_ms Nullable(Int64),
  ended_at_ms Nullable(Int64),
  duration_ms Nullable(Int64),
  diagnostics Array(String),
  data String,
  materialized_at_ms Int64
) ENGINE = ReplacingMergeTree(materialized_at_ms)
PARTITION BY sipHash64(trace_id) % 32
ORDER BY (trace_id, id);
```

Read query groups by `(trace_id, id)` and uses `argMax` for latest fields.

Read query:

```sql
SELECT
  trace_id,
  id,
  argMax(from_node_id, materialized_at_ms) AS from_node_id,
  argMax(to_node_id, materialized_at_ms) AS to_node_id,
  argMax(label, materialized_at_ms) AS label,
  argMax(status, materialized_at_ms) AS status,
  argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
  argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
  argMax(duration_ms, materialized_at_ms) AS duration_ms,
  argMax(diagnostics, materialized_at_ms) AS diagnostics,
  argMax(data, materialized_at_ms) AS data,
  max(materialized_at_ms) AS latest_materialized_at_ms
FROM topo_tracer.node_read_edges
WHERE trace_id = {traceId:String}
GROUP BY trace_id, id
```

## Trace Summary

Table: `topo_tracer.node_trace_summary`

```sql
CREATE TABLE IF NOT EXISTS topo_tracer.node_trace_summary (
  trace_id String,
  created_at_ms Int64,
  updated_at_ms Int64,
  node_count UInt64,
  edge_count UInt64,
  error_count UInt64,
  diagnostic_count UInt64,
  max_importance_level Int32,
  materialized_at_ms Int64
) ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY trace_id;
```

Trace list query:

```sql
SELECT
  trace_id,
  created_at_ms,
  updated_at_ms,
  node_count,
  edge_count,
  error_count,
  diagnostic_count,
  max_importance_level,
  latest_materialized_at_ms AS materialized_at_ms
FROM (
  SELECT
    trace_id,
    argMax(created_at_ms, materialized_at_ms) AS created_at_ms,
    argMax(updated_at_ms, materialized_at_ms) AS updated_at_ms,
    argMax(node_count, materialized_at_ms) AS node_count,
    argMax(edge_count, materialized_at_ms) AS edge_count,
    argMax(error_count, materialized_at_ms) AS error_count,
    argMax(diagnostic_count, materialized_at_ms) AS diagnostic_count,
    argMax(max_importance_level, materialized_at_ms) AS max_importance_level,
    max(materialized_at_ms) AS latest_materialized_at_ms
  FROM topo_tracer.node_trace_summary
  GROUP BY trace_id
)
ORDER BY updated_at_ms DESC
LIMIT {limit:UInt32} OFFSET {offset:UInt32}
```

Summary reads follow the same alias rule: the inner aggregate query emits
`latest_materialized_at_ms`; the outer select exposes `materialized_at_ms`.

Count query:

```sql
SELECT uniqExact(trace_id) AS total
FROM topo_tracer.node_trace_summary
```

## Worker

Startup:

- Subscribe to `trace.events.ingested`.
- Add payload trace ids to an in-memory pending set.
- Debounce 25ms, then materialize batches.
- Run recovery scan every `TRACE_MATERIALIZER_RECOVERY_INTERVAL_MS`.

Recovery scan is safety net for missed in-memory events, manual materialization,
and future multi-worker gaps. Production Kafka should replace the in-memory bus
with durable delivery.

## Materializer

Algorithm:

1. Fold node events by `entityId`.
2. Fold edge events by `entityId`.
3. Merge repeated metadata into `data`.
4. Use earliest start and latest end.
5. Compute ancestry and diagnostics.
6. Compute causal `flowOrder`.
7. Emit nodes, edges, and summary.

`TraceReadModelBuilder` emits monotonic `materializedAtUnixMs` so rapid
materializations never tie.

## Graph Projection

`GET /telemetry/traces/:traceId/graph`:

1. Load summary for the trace.
2. Clamp `maxImportance`, `limit`, and cursor offset.
3. Query latest node rows with `argMax(..., materialized_at_ms)`.
4. Build `visible_ids` where `importance_level <= maxImportance`.
5. For hidden nodes, use `arrayReverse(ancestry_path)` and `arrayFirst` to find
   nearest visible ancestor directly in ClickHouse.
6. Aggregate hidden nodes into ghost rows.
7. Union visible rows and ghost rows, sort by `flow_order`, and apply
   `LIMIT/OFFSET`.
8. Query latest edges, join endpoint nodes, resolve hidden endpoints to ghost
   ids, group lifted duplicate edges, and return only edges whose resolved
   endpoints are inside the returned node window.

Projection query alias rules:

- Hidden-node aggregate fields use private aliases such as `group_status`.
- Lifted-edge grouping uses explicit raw edge aliases such as `edge_source_id`
  and `edge_row_status`.
- Grouped-edge aggregate outputs use private aliases such as `edge_status`,
  `min_started_at_ms`, `max_ended_at_ms`, `grouped_diagnostics`, and
  `edge_hidden_edge_count`.
- A final outer select maps those private aliases back to response names:
  `id`, `trace_id`, `status`, `started_at_ms`, `ended_at_ms`, `diagnostics`,
  and `hidden_edge_count`.

This shape avoids ClickHouse treating aliases like `status`, `id`, or
`materialized_at_ms` as replacements inside other aggregate expressions such as
`countIf(...)`, `any(...)`, or `argMax(...)`.

The frontend chooses visual layout. Backend already returns a projected graph
window: real nodes, ghost nodes, lifted edges, counts, cursors, and metadata.

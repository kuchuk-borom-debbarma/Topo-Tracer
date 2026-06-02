# Backend Schema And Queries

Source:

- `carno.js/src/infra/ClickHouseService.ts`
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

Edges are the only graph links. Node rows do not store parent ids, ancestry
paths, indentation, or structural hierarchy.

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
  from_node_id Nullable(String),
  to_node_id Nullable(String),
  label Nullable(String),
  status Nullable(String),
  data String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(received_at_ms / 1000))
ORDER BY (trace_id, received_at_ms, event_id);
```

Replay query collapses duplicate event ids with `argMax` and orders by backend
receive time:

```sql
SELECT
  event_id,
  argMax(trace_id, received_at_ms) AS event_trace_id,
  argMax(entity_id, received_at_ms) AS entity_id,
  argMax(entity_type, received_at_ms) AS entity_type,
  argMax(event_type, received_at_ms) AS event_type,
  argMax(occurred_at_ms, received_at_ms) AS occurred_at_ms,
  max(received_at_ms) AS latest_received_at_ms,
  min(received_at_ms) AS first_received_at_ms,
  argMax(name, received_at_ms) AS name,
  argMax(importance_level, received_at_ms) AS importance_level,
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

## Read Nodes

Table: `topo_tracer.node_read_nodes`

```sql
CREATE TABLE IF NOT EXISTS topo_tracer.node_read_nodes (
  trace_id String,
  id String,
  name String,
  importance_level Int32,
  status LowCardinality(String),
  started_at_ms Nullable(Int64),
  ended_at_ms Nullable(Int64),
  duration_ms Nullable(Int64),
  flow_order Int64,
  diagnostics Array(String),
  data String,
  materialized_at_ms Int64
) ENGINE = ReplacingMergeTree(materialized_at_ms)
PARTITION BY sipHash64(trace_id) % 32
ORDER BY (trace_id, id);
```

Latest-node reads group by `(trace_id, id)` and use private aggregate aliases:

```sql
SELECT
  trace_id,
  id,
  argMax(name, materialized_at_ms) AS name,
  argMax(importance_level, materialized_at_ms) AS importance_level,
  argMax(status, materialized_at_ms) AS status,
  argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
  argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
  argMax(duration_ms, materialized_at_ms) AS duration_ms,
  argMax(flow_order, materialized_at_ms) AS flow_order,
  argMax(diagnostics, materialized_at_ms) AS diagnostics,
  argMax(data, materialized_at_ms) AS data,
  max(materialized_at_ms) AS latest_materialized_at_ms
FROM topo_tracer.node_read_nodes
WHERE trace_id = {traceId:String}
GROUP BY trace_id, id
```

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

Edges are materialized from edge lifecycle events only. The backend never creates
synthetic relationship edges from node shape.

## Graph Projection

`ReadModelRepository.getProjectedGraph`:

1. Loads latest nodes.
2. Loads latest edges.
3. Keeps nodes with `importanceLevel <= maxImportance`.
4. Creates one `ghost:hidden:N` node per contiguous lower-importance run.
5. Windows projected nodes by `flowOrder`.
6. Resolves explicit edges to visible endpoints or the matching hidden segment ghost.
7. Groups lifted ghost edges by `from`, `to`, and `label`.

If both endpoints resolve to the same hidden segment, the edge is omitted from the
window because it would not connect visible graph items.

## Alias Rule

Do not alias aggregate outputs back to source column names inside the same
aggregate `SELECT`. Use names like `latest_materialized_at_ms` and map them to
API field names from an outer non-aggregate select or TypeScript mapper. This
avoids ClickHouse alias substitution creating illegal nested aggregates.

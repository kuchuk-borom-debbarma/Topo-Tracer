# Topo Tracer Design

Topo Tracer stores a primitive graph: nodes are work; edges are causal links.
There is no span/container compatibility layer.

## Core Model

Entities:

- `Node`: request, function, service call, DB query, queue publish/consume, or
  user-defined work.
- `Edge`: causal link between nodes with label and optional lifecycle.

Node importance is semantic, not depth:

```ts
Importance.CRITICAL  // 0
Importance.SERVICE   // 1
Importance.OPERATION // 2
Importance.DETAIL    // 3
Importance.NOISE     // 4
```

Lower number means more important. Slider value `N` shows nodes where
`importanceLevel <= N`. Hidden nodes collapse into ghost nodes with count,
error count, duration, and sampled ids.

## Write Path

SDK sends immutable lifecycle events:

- `node.started`
- `node.ended`
- `edge.started`
- `edge.ended`

Every SDK event has a stable `eventId`. Backend still generates one if an older
client omits it, but retry-safe ingestion depends on SDK-side ids.

Backend flow:

1. Validate request body.
2. Append raw events to ClickHouse.
3. Publish `trace.events.ingested` on `EventBus`.
4. Event-driven worker batches dirty trace ids.
5. Worker replays raw events and writes read models.

Event bus rule:

- Application code publishes domain events only.
- Idempotency/delivery dedupe live inside event bus implementation.
- Dev implementation is `InMemoryEventBus`.
- Kafka implementation can later satisfy same `EventBus` contract.

## Contracts

Backend service/infra boundaries are declared in contracts:

- `EventBusPort`
- `RawEventStore`
- `TraceReadModelStore`
- `TraceReadModelProjector`
- `TraceLogService`

Carno injects runtime classes, so `EventBus` is also a runtime DI token. Callers
depend on the contract surface; providers can swap underneath.

## Materialized Model

Raw table is append-only. Read tables are rebuildable:

- `node_read_nodes`
- `node_read_edges`
- `node_trace_summary`

Read queries do not use `FINAL` on hot paths. They group by logical ids and use
`argMax(..., materialized_at_ms)` so latest materialization wins even if old rows
have different `flow_order`.

ClickHouse query aliases are intentionally private inside aggregate stages.
Aggregate outputs use names like `latest_materialized_at_ms`, `group_status`,
and `edge_status`, then outer selects map them back to response field names.
This avoids ClickHouse alias substitution creating illegal nested aggregates in
expressions such as `argMax(...)`, `countIf(...)`, and `any(...)`.

Materializer computes:

- lifecycle status and duration
- ancestry path and diagnostics
- causal `flowOrder`
- trace summary counts
- monotonic `materializedAtUnixMs`

Diagnostics:

- `clockSkewSuspected`
- `negativeDuration`
- `missingStart`
- `missingEnd`
- `cycleDetected`
- `orphanNode`
- `orphanEdge`

Open edges are valid async/fire-and-forget links.

## Ancestry Path

`ancestryPath` is stored on every materialized node. It is an ordered array of
ancestor node ids from root to direct parent.

Example tree:

```text
n-root
  n-pay
    n-card
  n-pub
```

Materialized node ancestry:

| node | parentId | ancestryPath | meaning |
| --- | --- | --- | --- |
| `n-root` | `null` | `[]` | root has no ancestors |
| `n-pay` | `n-root` | `["n-root"]` | direct child of root |
| `n-card` | `n-pay` | `["n-root", "n-pay"]` | root -> payment -> card |
| `n-pub` | `n-root` | `["n-root"]` | direct child of root |

Rules:

- `parentId` stores only direct parent.
- `ancestryPath` stores full parent chain.
- Last item in `ancestryPath` is direct parent when parent exists.
- `indentLevel = ancestryPath.length`.
- Root nodes always have `[]`.

Why store array on node rows:

- Graph projection needs nearest visible ancestor for hidden nodes.
- ClickHouse handles arrays efficiently for trace-scoped reads.
- `arrayReverse(ancestry_path)` searches from direct parent back to root.
- `arrayFirst(ancestor_id -> has(visible_ids, ancestor_id), ...)` finds nearest
  visible ancestor in one query.
- This avoids a separate ancestry index table and avoids writing one extra row
  per ancestor hop.

Why no edge ancestry:

- Edges are causal links, not hierarchy owners.
- Edge projection resolves each endpoint through that endpoint node's
  `ancestryPath`.
- Storing ancestry on edges would duplicate derived state and would need updates
  whenever node parentage changes.
- Add edge ancestry only when a future query needs path-aware edge analytics
  that cannot be answered through endpoint node joins.

## Graph Projection

Read API:

```http
GET  /telemetry/traces
GET  /telemetry/traces/:traceId/summary
GET  /telemetry/traces/:traceId/graph?maxImportance=1&limit=250&cursor=...
POST /telemetry/events
POST /telemetry/materialize
```

Projection steps:

1. Load latest summary for one trace.
2. Ask `ReadModelRepository.getProjectedGraph` for one graph window.
3. ClickHouse groups latest read rows by logical ids with `argMax`.
4. ClickHouse builds visible ids from `importanceLevel <= maxImportance`.
5. Hidden nodes use `ancestry_path Array(String)` to find nearest visible
   ancestor and aggregate ghost rows.
6. ClickHouse windows projected nodes by `flowOrder`.
7. ClickHouse resolves/lifts edges through visible or ghost endpoints, then only
   returns edges whose resolved endpoints are in the node window.

Hard response cap is 500 nodes.

## Frontend View

Frontend is one workspace:

- Left rail: traces.
- Center: free-form graph canvas.
- Right: inspector.

Graph layout:

- X axis is importance level: `i0`, `i1`, `i2`, etc.
- Y axis is causal order inside each importance level.
- Nodes are compact cards with status, importance, title, duration, time range,
  ghost summary, and diagnostics.
- Edges are labeled curves.
- Completed edges are blue.
- Open edges are amber.
- Ghost/back edges are muted dashed curves.

The UI does not use structural indentation for placement. `indentLevel` still
exists in the read model because projection uses ancestry for ghost grouping and
diagnostics.

## Future Work

- Kafka-backed `EventBus`.
- Dirty-trace durable queue for multi-process workers.
- Search/jump-to-node.

# Topo Tracer Design

Topo Tracer is now a primitive node-to-node trace graph. There is no group,
container, span compatibility layer, or derived hierarchy beyond parent links.

## Core Model

Trace data has two entities:

- `Node`: one meaningful unit of work. It may be a request, function, service
  call, database query, queue publish, queue consume, or user-defined event.
- `Edge`: one causal link from one node to another. It carries a label and its
  own timing so arrows can say `calls`, `writes`, `publishes`, `delivers`, or
  `fire-and-forget`.

Each node has:

- `id`
- `traceId`
- `parentId`
- `name`
- `importanceLevel`
- `startedAtUnixMs`
- `endedAtUnixMs`
- `durationMs`
- `indentLevel`
- `status`
- `data`

`importanceLevel` is set by the SDK/user. It is not call depth. Lower number
means more important:

- `0`: critical story node
- `1`: service or major boundary
- `2`: operation
- `3`: detail
- `4`: noisy implementation detail

Developers can choose their own meaning. For example, a distributed trace can
set all service boundary nodes to `0`, even when one service is nested under
another in the causal tree.

## Importance Slider

Frontend slider value `N` shows nodes where:

```ts
node.importanceLevel <= N
```

All hidden nodes are summarized as ghost nodes. Example:

```text
a(0) -> b(1) -> c(4) -> d(4) -> e(1) -> f(0)
```

At slider `0`:

```text
a -> ghost(covers b,c,d,e) -> f
```

At slider `1`:

```text
a -> b -> ghost(covers c,d) -> e -> f
```

Ghost nodes keep flow understandable without flooding the graph. A ghost node
stores hidden node count, hidden error count, first hidden start time, last
hidden end time, hidden duration, and a short sample of hidden node ids.

## Indentation

Indentation is structural, not semantic. Backend computes `indentLevel` from
`ancestryPath.length` when it materializes nodes. Frontend uses `indentLevel` for
horizontal placement. SDK does not send indentation because SDK authors should
only describe work and importance, not UI layout.

Backend is best place for this calculation because it already validates parent
links, detects cycles/orphans, creates ancestry, and inserts ghost nodes. Ghost
nodes get `parent.indentLevel + 1`, so collapsed work appears visually between
the visible parent and later visible descendants.

## Write Path

Writes are append-only. SDK sends immutable lifecycle events:

- `node.started`
- `node.ended`
- `edge.started`
- `edge.ended`

`edge.ended` is optional. Missing edge end means async, open, or
fire-and-forget.

Raw table: `topo_tracer.node_trace_events`

Design:

- `MergeTree`, not replacing, because raw history must be immutable.
- `ORDER BY (trace_id, received_at_ms, event_id)` because materialization is
  trace-scoped and backend receive time gives deterministic replay when SDK
  clocks skew.
- `PARTITION BY toYYYYMM(received_at_ms)` because raw writes age by ingest time.
- `importance_level Nullable(Int32)` because only `node.started` needs it.

## Timestamp Rules

Every event has dual time:

- `occurredAtUnixMs`: source/SDK event time.
- `receivedAtUnixMs`: backend receive time.

Read model uses `occurredAtUnixMs` for durations:

```text
node.duration = node.ended.occurredAt - node.started.occurredAt
edge.duration = edge.ended.occurredAt - edge.started.occurredAt
```

Read model uses causal links first for ordering. Timestamps never override
parent/edge causality. `receivedAtUnixMs` is diagnostic and tie-break data.

Safety diagnostics:

- `clockSkewSuspected`
- `negativeDuration`
- `missingStart`
- `missingEnd`
- `cycleDetected`
- `orphanNode`
- `orphanEdge`

Open edges are valid for async/fire-and-forget flow. Missing `edge.ended` keeps
edge status/duration open; it is not a `missingEnd` diagnostic by itself.

## Materialized Read Model

Background worker rebuilds read tables from raw events.

Tables:

- `node_read_nodes`
- `node_read_edges`
- `node_read_node_ancestry`
- `node_trace_summary`

`node_read_nodes` design:

- `ReplacingMergeTree(materialized_at_ms)` allows late events to rebuild rows
  without changing raw history.
- `ORDER BY (trace_id, flow_order, id)` serves graph pages in causal order.
- `importance_level` is a real column so slider queries avoid JSON parsing.
- `indent_level` is a real column so frontend graph layout does not recompute
  ancestry on every render.
- `ancestry_path Array(String)` lets projection find nearest visible ancestor.

`node_read_edges` design:

- `ReplacingMergeTree(materialized_at_ms)` for rebuilds.
- `ORDER BY (trace_id, from_node_id, to_node_id, id)` keeps endpoint scans local
  to one trace.

`node_read_node_ancestry` design:

- One row per ancestor hop.
- `ancestor_depth` is only index position inside ancestry path. It is not
  importance.
- `ORDER BY (trace_id, ancestor_id, node_id)` supports future descendant summary
  queries without scanning all node JSON.

`node_trace_summary` design:

- One row per trace.
- Stores node/edge/error/diagnostic counts.
- Stores `max_importance_level` so frontend can size slider without loading full
  graph.

## Flow Projection

Read API:

```http
GET /telemetry/traces
GET /telemetry/traces/:traceId/summary
GET /telemetry/traces/:traceId/graph?maxImportance=1&limit=250&cursor=...
POST /telemetry/events
POST /telemetry/materialize
```

Projection steps:

1. Load materialized nodes, edges, and summary for one trace.
2. Keep visible nodes where `importanceLevel <= maxImportance`.
3. Group hidden nodes under nearest visible ancestor using `ancestryPath`.
4. Create ghost nodes with timing/error summaries.
5. Lift edges so hidden endpoints connect through visible or ghost nodes.
6. Sort by `flowOrder`.
7. Apply cursor pagination.

Cursor pagination is offset-based over projected causal order. API returns:

- `hasBefore`
- `hasAfter`
- `previousCursor`
- `nextCursor`
- `returnedNodeCount`
- `hiddenNodeCount`
- `ghostNodeCount`

Hard cap is 500 nodes per response. No API returns unbounded graph data by
default.

## Frontend View

Frontend has one view: graph flow.

- Nodes are cards with name, importance, duration, start/end time, status, and
  diagnostics.
- Edges are arrows with labels and timing in inspector.
- Horizontal indentation comes from backend-computed `indentLevel`; importance
  controls show/hide only.
- Importance slider controls detail level.
- Ghost nodes show hidden count, error count, and hidden time.
- Inspector shows full id, status, start time, end time, duration, diagnostics,
  and metadata JSON.

This view supports monolith and distributed traces because service calls,
function calls, database work, queue work, and async work are all just nodes and
edges.

## SDK Guidance

Use named importance constants:

```ts
Importance.CRITICAL // 0
Importance.SERVICE  // 1
Importance.OPERATION // 2
Importance.DETAIL   // 3
Importance.NOISE    // 4
```

Set service boundary nodes to `CRITICAL` or `SERVICE` when you want distributed
flow visible at low slider values. Set deeply nested implementation details to
`DETAIL` or `NOISE` so they collapse into ghost summaries.

Child nodes default to parent importance. This keeps traces quiet unless caller
chooses more detail.

## Future Work

- Query ghost summaries directly from `node_read_node_ancestry` for very
  large traces instead of loading all nodes first.
- Add search anchors so graph can jump to node id/name and page around it.
- Add richer async/pubsub layout lanes, while keeping same primitive node-edge
  data model.

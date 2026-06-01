# Topo Tracer Primitive Design

Topo Tracer stores one primitive graph: nodes connected to nodes by edges. No groups, containers, services, modules, or special boundaries exist in the core model. Extra context belongs in node/edge `data`.

## Core Model

- Node: timed work item. Has `id`, `traceId`, `name`, `depth`, optional `parentId`, timestamps, status, and data.
- Edge: timed connection from one node to another. Has `fromNodeId`, `toNodeId`, `label`, timestamps, status, and data.
- Depth: explicit nesting number. Frontend depth slider shows nodes with `depth <= maxDepth`.
- Ghost node: read-time summary for nodes hidden by depth slider.

## Write Path

Clients append immutable lifecycle events to `POST /telemetry/events`.

Node events:

- `node.started`
- `node.ended`

Edge events:

- `edge.started`
- `edge.ended`

`edge.ended` is optional. Missing end means async, open, or fire-and-forget.

Each event stores source time (`occurredAtUnixMs`) and backend receive time (`receivedAtUnixMs`). Source time drives durations. Causal links drive graph order.

## ClickHouse Tables

- `primitive_trace_events`: append-only raw lifecycle events.
- `primitive_read_nodes`: materialized node rows ordered by `(trace_id, flow_order, id)`.
- `primitive_read_edges`: materialized edge rows ordered by `(trace_id, from_node_id, to_node_id, id)`.
- `primitive_read_node_ancestry`: node ancestor index for subtree and ghost queries.
- `primitive_trace_summary`: per-trace counts, max depth, errors, diagnostics.

Read tables use `ReplacingMergeTree(materialized_at_ms)`, so worker can rebuild read rows while raw events remain immutable.

## Materialization

Background worker folds raw lifecycle events into read rows:

- merges node start/end into one read node.
- merges edge start/end into one read edge.
- computes missing depth from ancestry when SDK omits depth.
- computes `ancestryPath` from parent chain.
- computes causal `flowOrder` from parent links and edges.
- records diagnostics: missing start/end, negative duration, cycle, orphan node/edge, clock skew.

## Graph Projection

`GET /telemetry/traces/:traceId/graph` returns graph window.

Query params:

- `maxDepth`: show nodes at or above depth.
- `limit`: max nodes, capped at 500.
- `cursor`: simple offset cursor for previous/next pages.

Projection rules:

- visible node: `depth <= maxDepth`.
- hidden node: `depth > maxDepth`.
- ghost node: one summary per visible ancestor with hidden descendants.
- lifted edge: if endpoint hidden, route edge to nearest ghost/visible ancestor.
- self-loop after lifting is dropped.

Response includes `hasBefore`, `hasAfter`, `previousCursor`, `nextCursor`, hidden count, and ghost count.

## Frontend

Frontend renders graph view:

- x-axis = depth.
- y-axis = causal order.
- nodes show name, depth, duration, status, diagnostics, and data.
- edges draw SVG arrows with labels and duration data.
- depth slider hides/shows detail.
- ghost nodes summarize hidden deeper nodes.
- Prev/Next buttons use cursor pagination.

This makes zoom simple: move depth slider. Low depth shows story. High depth reveals internals.

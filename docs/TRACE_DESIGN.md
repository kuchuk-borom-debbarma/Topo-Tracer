# Topo Tracer Design

Topo Tracer stores traces as append-only lifecycle events and presents them as a causal flow. The write model is optimized for safety and ingestion speed. The read model is rebuilt by a background worker for fast trace browsing, ancestry queries, and capped flow windows.

## Core Model

- Container: a place or boundary, such as service, module, function, database, queue, or external system.
- Node: timed work or event inside a container. Nodes may have `parentId` for nested work.
- Edge: timed causal operation between nodes. Edges have `edge.started` and optional `edge.ended`; missing end means open, async, or fire-and-forget.

The model is graph plus hierarchy:

- hierarchy comes from `parentId` and ancestry arrays.
- flow comes from edges and parent-child relationships.
- time is metadata for duration and diagnostics, not primary ordering.

## Append-Only Writes

Clients send events to `POST /telemetry/events`.

Raw event types:

- `container.started`
- `container.ended`
- `node.started`
- `node.ended`
- `edge.started`
- `edge.ended`

Each event stores:

- `occurredAtUnixMs`: source timestamp from SDK/application.
- `receivedAtUnixMs`: backend receive timestamp.
- entity identifiers and optional relationship fields.
- metadata JSON.

Raw trace data is never updated or deleted by normal tracing paths.

## Timestamp Semantics

Flow order is causal-first. Parent links and edges decide what happened after what. Timestamps are used for durations, labels, and diagnostics.

Duration rules:

- node duration = `node.ended.occurredAtUnixMs - node.started.occurredAtUnixMs`.
- edge duration = `edge.ended.occurredAtUnixMs - edge.started.occurredAtUnixMs`.
- missing end keeps duration null and status open unless another status is provided.

Diagnostics:

- `clockSkewSuspected`: source timestamps conflict with causal order.
- `negativeDuration`: end time is before start time.
- `missingStart`: entity has no start event.
- `missingEnd`: entity has no end event.
- `cycleDetected`: parent or edge graph contains a cycle.
- `orphanNode`: node references missing parent/container.
- `orphanEdge`: edge references missing endpoint.

## Read Model

The background worker periodically materializes traces from `trace_events`.

Read tables:

- `read_containers`
- `read_nodes`
- `read_edges`
- `read_container_ancestry`
- `read_node_ancestry`
- `read_trace_summary`

Read rows include `materializedAtUnixMs` and use replacing tables, so the worker can rebuild a trace without mutating raw events.

## Flow Windows

Large traces are never returned as one unbounded graph. `GET /telemetry/traces/:traceId/flow-window` returns a capped window.

Inputs:

- `anchorId`: node to focus around.
- `cursor`: encoded flow position for paging.
- `before` / `after`: causal window size around anchor.
- `expandedIds`: nodes whose local children should be included.
- `hiddenIds`: nodes hidden by user.
- `detailBudget`: hard cap, max 500.

Response includes:

- visible containers, nodes, and edges.
- `hasMoreBefore` / `hasMoreAfter`.
- `previousCursor` / `nextCursor`.
- omitted node and edge counts.

This keeps 10k+ traces responsive while preserving causal context.

## Frontend View

The frontend uses one primary view: Adaptive Causal Swimlane.

- vertical position means causal progression.
- horizontal lanes mean container boundaries.
- node cards show name, kind, duration, status, and diagnostics.
- edge chips show synchronous calls and open/fire-and-forget edges.
- inspector shows selected node/edge details.
- load controls page through flow windows.

The first version renders synchronous flow. Async/pubsub edges are stored with lifecycle semantics and can be rendered with specialized branch layouts later.

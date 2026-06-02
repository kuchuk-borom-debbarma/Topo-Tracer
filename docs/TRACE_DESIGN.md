# Topo Tracer Design

Topo Tracer stores a primitive graph:

- Nodes are work.
- Edges are the only links between nodes.
- Nodes do not have `parentId`, ancestry, span containment, or structural links.

`startNode()` creates another node in the same trace. It does not connect that
node to anything. Use `connectTo()` or `Tracer.connect()` whenever the graph
should show a relationship.

## Core Model

Entities:

- `Node`: request, function, service call, DB query, queue publish/consume, or
  user-defined work.
- `Edge`: causal link between two nodes with a label and optional lifecycle.

Node importance is semantic, not depth:

```ts
Importance.CRITICAL  // 0
Importance.SERVICE   // 1
Importance.OPERATION // 2
Importance.DETAIL    // 3
Importance.NOISE     // 4
```

Lower number means more important. Slider value `N` shows nodes where
`importanceLevel <= N`. Hidden nodes collapse into one ghost group. Edges are
lifted only when an explicit edge crosses from a visible node to a hidden node,
or from a hidden node to a visible node.

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

## SDK Linking

```ts
const request = Tracer.startTrace("POST /checkout");
const validate = request.startNode("validateCart()");
const write = request.startNode("INSERT order");

request.connectTo(validate, { label: "validates" });
validate.connectTo(write, { label: "writes" });
```

Distributed traces use source carrier headers. The receiving service creates a
node in the same trace; either side can emit an explicit edge when it knows both
node ids.

```ts
const payment = Tracer.continueTrace(api.createCarrierHeaders(), "Payment.charge()");
api.connectTo(payment, { label: "grpc call" });
```

## Materialized Model

Raw table is append-only. Read tables are rebuildable:

- `node_read_nodes`
- `node_read_edges`
- `node_trace_summary`

Read queries do not use `FINAL` on hot paths. They group by logical ids and use
`argMax(..., materialized_at_ms)` so latest materialization wins even if old rows
have different `flow_order`.

Materializer computes:

- lifecycle status and duration
- causal `flowOrder` from explicit edges
- trace summary counts
- monotonic `materializedAtUnixMs`

Diagnostics:

- `clockSkewSuspected`
- `negativeDuration`
- `missingStart`
- `missingEnd`
- `cycleDetected`
- `orphanEdge`

Open edges are valid async/fire-and-forget links.

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
2. Load latest read nodes and read edges for the trace.
3. Keep nodes where `importanceLevel <= maxImportance`.
4. Collapse all lower-priority nodes into `ghost:hidden` when needed.
5. Window projected nodes by `flowOrder`.
6. Return only explicit edges whose resolved endpoints are in the window.

Hard response cap is 500 nodes.

## Frontend View

Frontend is one workspace:

- Left rail: traces.
- Center: free-form canvas graph.
- Right: inspector.

The canvas renderer uses only `GraphWindowResponse.nodes` and
`GraphWindowResponse.edges`. It does not derive links from node shape.

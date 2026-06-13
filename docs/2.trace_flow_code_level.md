# Trace Flow At Code Level

This doc follows one trace from SDK write, to backend raw storage, to read-model
materialization, to graph response, to frontend layout.

## Example Trace

```ts
import { Importance, Tracer } from "../src";

Tracer.init({ baseUrl: "http://localhost:3999" });

const request = Tracer.startTrace("POST /checkout", {
  importanceLevel: Importance.CRITICAL,
  data: { service: "checkout-api" },
});

const payment = request.startNode("payment service", {
  importanceLevel: Importance.SERVICE,
  data: { service: "payment" },
});
request.connectTo(payment, { label: "calls" });

const cardAuth = payment.startNode("authorize card", {
  importanceLevel: Importance.DETAIL,
  data: { provider: "stripe" },
});
payment.connectTo(cardAuth, { label: "authorizes" });
cardAuth.end("ok");

const publishReceipt = request.startNode("publish receipt", {
  importanceLevel: Importance.OPERATION,
  data: { topic: "receipt.created" },
});
payment.connectTo(publishReceipt, { label: "publishes" });
publishReceipt.end("ok");

payment.end("ok");
request.end("ok");

await Tracer.flush();
await Tracer.shutdown();
```

Important rule:

- `startNode()` only creates a node.
- `connectTo()` creates the graph link.
- Nodes do not carry `parentId`.

## Whole Flow

```text
SDK TraceNode
  -> BatchExporter
  -> POST /telemetry/events
  -> LogController.ingestEvents
  -> LogService.ingestEvents
  -> RawEventRepository.append
  -> ClickHouse node_trace_events
  -> EventBus.publish("trace.events.ingested")
  -> TraceReadModelWorker queue
  -> RawEventRepository.getTraceEvents
  -> TraceReadModelBuilder.build
  -> ReadModelRepository.saveTraceReadModel
  -> ClickHouse read tables
  -> GET /telemetry/traces/:traceId/graph
  -> LogService.getGraph
  -> ReadModelRepository.getProjectedGraph
  -> GraphWindowResponse
  -> frontend canvas renderer
```

## SDK Events

`Tracer.startTrace(...)` creates the root `TraceNode` and emits `node.started`.
Each `TraceNode.startNode(...)` emits another `node.started` in the same trace.
Edges are emitted only by `connectTo()` or `Tracer.connect()`.

Typical queued events:

| Moment | Code | Event |
| --- | --- | --- |
| Root starts | `Tracer.startTrace(...)` | `node.started` for `n-root` |
| Payment starts | `request.startNode(...)` | `node.started` for `n-pay` |
| Link root to payment | `request.connectTo(payment, { label: "calls" })` | `edge.started`, `edge.ended` |
| Card starts | `payment.startNode(...)` | `node.started` for `n-card` |
| Link payment to card | `payment.connectTo(cardAuth, { label: "authorizes" })` | `edge.started`, `edge.ended` |
| Nodes end | `end("ok")` | `node.ended` |

`connectTo()` ends edges immediately by default. Pass
`{ endImmediately: false }` for async or fire-and-forget edges and call
`endEdge(edgeId)` later if the edge eventually completes.

## HTTP Batch Shape

Node event:

```json
{
  "eventId": "evt-root-start",
  "traceId": "trace-1",
  "entityId": "n-root",
  "entityType": "node",
  "eventType": "node.started",
  "occurredAtUnixMs": 1000,
  "name": "POST /checkout",
  "importanceLevel": 0,
  "status": "open",
  "data": { "service": "checkout-api" }
}
```

Edge event:

```json
{
  "eventId": "evt-edge-start",
  "traceId": "trace-1",
  "entityId": "e-root-pay",
  "entityType": "edge",
  "eventType": "edge.started",
  "occurredAtUnixMs": 1010,
  "fromNodeId": "n-root",
  "toNodeId": "n-pay",
  "label": "calls",
  "status": "open"
}
```

## Materializer

`TraceReadModelBuilder.build()` replays raw events into:

- `ReadNode[]`
- `ReadEdge[]`
- `TraceSummary`

Node rows contain identity, name, importance, lifecycle times, status,
diagnostics, data, and `flowOrder`. Edge rows contain endpoints, label,
lifecycle times, status, diagnostics, and data.

`flowOrder` is computed from explicit edges. Nodes with no inbound explicit edge
are ordered by start time and id.

## Graph Response

`GET /telemetry/traces/:traceId/graph?maxImportance=1` returns:

```json
{
  "nodes": [
    { "id": "n-root", "name": "POST /checkout", "importanceLevel": 0 },
    { "id": "n-pay", "name": "payment service", "importanceLevel": 1 },
    { "id": "ghost:hidden:0", "isGhost": true, "hiddenNodeCount": 2 }
  ],
  "edges": [
    { "fromNodeId": "n-root", "toNodeId": "n-pay", "label": "calls" },
    { "fromNodeId": "n-pay", "toNodeId": "ghost:hidden:0", "label": "authorizes", "isGhost": true }
  ]
}
```

Hidden ghosts exist only because low-importance nodes were filtered out. Each
ghost represents one contiguous hidden run in flow order; it does not define
parentage.

## Frontend

The frontend canvas uses:

- `nodes` for cards.
- `edges` for arrows.

It does not infer links from node ids, ordering, hidden groups, or layout.

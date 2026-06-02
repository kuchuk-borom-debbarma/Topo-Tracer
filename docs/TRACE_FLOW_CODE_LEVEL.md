# Trace Flow At Code Level

This doc follows one trace from SDK write, to backend raw storage, to read-model
materialization, to graph read response, to frontend layout.

Use it when you need to answer:

- What code writes trace events?
- What state exists after ingest?
- How does worker build read tables?
- What happens when graph is read?
- How does `maxImportance` change returned nodes and edges?

## Example Trace

Example app code:

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

const cardAuth = payment.startNode("authorize card", {
  importanceLevel: Importance.DETAIL,
  data: { provider: "stripe" },
});
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

For readability, this doc uses stable ids:

| Symbol | Real field | Meaning |
| --- | --- | --- |
| `trace-1` | `traceId` | One trace |
| `n-root` | request node id | `POST /checkout`, importance `0` |
| `n-pay` | payment node id | `payment service`, importance `1` |
| `n-card` | card auth node id | `authorize card`, importance `3` |
| `n-pub` | publish node id | `publish receipt`, importance `2` |
| `e-root-pay` | edge id | SDK `continues`, root -> payment |
| `e-pay-card` | edge id | SDK `continues`, payment -> card |
| `e-root-pub` | edge id | SDK `continues`, root -> publish |
| `e-pay-pub` | edge id | explicit `publishes`, payment -> publish |

## Whole Flow Summary

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
  -> ClickHouse importance projection + edge lifting
  -> GraphWindowResponse
  -> frontend buildImportanceLayout
```

## Step 1: SDK Creates Node Events

Code path:

- `sdk/nodejs/src/Tracer.ts`
- `sdk/nodejs/src/Span.ts`
- `sdk/nodejs/src/BatchExporter.ts`

What happens:

1. `Tracer.startTrace(...)` creates root `TraceNode`.
2. `TraceNode` constructor emits `node.started`.
3. `request.startNode(...)` creates child `TraceNode`.
4. `startNode` also calls `connectTo(child, { label: "continues" })`.
5. `connectTo` emits `edge.started` and immediate `edge.ended` by default.
6. `node.end(...)` emits `node.ended`.
7. `BatchExporter` buffers events until batch size, timer, or `flush()`.

State beside code:

| Moment | Code | State |
| --- | --- | --- |
| Root starts | `Tracer.startTrace("POST /checkout")` | queued `node.started` for `n-root`, importance `0`, parent `null` |
| Payment starts | `request.startNode("payment service")` | queued `node.started` for `n-pay`, parent `n-root`, importance `1` |
| SDK links root -> payment | inside `startNode` | queued `edge.started` and `edge.ended` for `e-root-pay`, label `continues` |
| Card starts | `payment.startNode("authorize card")` | queued `node.started` for `n-card`, parent `n-pay`, importance `3` |
| Publish starts | `request.startNode("publish receipt")` | queued `node.started` for `n-pub`, parent `n-root`, importance `2` |
| Explicit edge | `payment.connectTo(publishReceipt, { label: "publishes" })` | queued edge lifecycle for `e-pay-pub` |
| Ends | `end("ok")` calls | queued `node.ended` events |

Important detail:

- SDK now assigns stable `eventId` to every lifecycle event.
- If a flush is retried, same event object keeps same `eventId`.
- Backend/event bus can dedupe around that identity.

## Step 2: SDK Flushes HTTP Batch

Code path:

- `BatchExporter.flush()`
- `fetch(`${baseUrl}/telemetry/events`, ...)`

POST body shape:

```json
[
  {
    "eventId": "evt-root-start",
    "traceId": "trace-1",
    "entityId": "n-root",
    "entityType": "node",
    "eventType": "node.started",
    "occurredAtUnixMs": 1000,
    "name": "POST /checkout",
    "importanceLevel": 0,
    "parentId": null,
    "status": "open",
    "data": { "service": "checkout-api" }
  },
  {
    "eventId": "evt-pay-start",
    "traceId": "trace-1",
    "entityId": "n-pay",
    "entityType": "node",
    "eventType": "node.started",
    "occurredAtUnixMs": 1010,
    "name": "payment service",
    "importanceLevel": 1,
    "parentId": "n-root",
    "status": "open",
    "data": { "service": "payment" }
  },
  {
    "eventId": "evt-pay-pub-start",
    "traceId": "trace-1",
    "entityId": "e-pay-pub",
    "entityType": "edge",
    "eventType": "edge.started",
    "occurredAtUnixMs": 1030,
    "fromNodeId": "n-pay",
    "toNodeId": "n-pub",
    "label": "publishes",
    "status": "open"
  }
]
```

State beside code:

| Code | State |
| --- | --- |
| `flush()` starts | `events` array is spliced out of SDK memory |
| HTTP succeeds | `consecutiveFailures = 0`; batch removed |
| HTTP fails within retry budget | batch is pushed back to front of queue |
| HTTP fails past retry budget | current batch is dropped, warning logged |

## Step 3: Backend Accepts Write

Code path:

- `carno.js/src/routes/LogController.ts`
- `carno.js/src/services/log/LogService.ts`

Call stack:

```text
POST /telemetry/events
  -> LogController.ingestEvents(@Body events)
  -> LogService.ingestEvents(events)
  -> validateEvents(events)
  -> RawEventRepository.append(events)
  -> EventBus.publish(...)
```

Validation state:

| Check | Example pass |
| --- | --- |
| body is array | batch is `TraceEventInput[]` |
| required fields | every event has `traceId`, `entityId`, `entityType`, `eventType` |
| timestamp | `occurredAtUnixMs` is finite |
| importance | node starts have non-negative number |
| node event type | node uses `node.started` or `node.ended` |
| edge event type | edge uses `edge.started` or `edge.ended` |

After validation:

```ts
const result = await rawEvents.append(events);

await eventBus.publish({
  type: "trace.events.ingested",
  idempotencyKey: buildTraceIngestedKey(result.eventIds),
  payload: {
    traceIds: result.traceIds,
    eventCount: result.count,
  },
});
```

State after append result:

```json
{
  "count": 16,
  "traceIds": ["trace-1"],
  "eventIds": [
    "evt-root-start",
    "evt-pay-start",
    "evt-pay-pub-start"
  ]
}
```

## Step 4: Raw Events Are Written

Code path:

- `RawEventRepository.append`
- `ClickHouseService.client.insert`
- table `topo_tracer.node_trace_events`

Repository normalizes rows:

| Input field | Stored column |
| --- | --- |
| `traceId` | `trace_id` |
| `eventId` or backend UUID | `event_id` |
| `entityId` | `entity_id` |
| `entityType` | `entity_type` |
| `eventType` | `event_type` |
| `occurredAtUnixMs` | `occurred_at_ms` |
| backend `Date.now()` | `received_at_ms` |
| `data` object | JSON string in `data` |

Raw table example state:

| trace_id | event_id | entity_id | entity_type | event_type | occurred_at_ms | received_at_ms | importance_level | parent_id | from_node_id | to_node_id | label |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| trace-1 | evt-root-start | n-root | node | node.started | 1000 | 2000 | 0 | null | null | null | null |
| trace-1 | evt-pay-start | n-pay | node | node.started | 1010 | 2000 | 1 | n-root | null | null | null |
| trace-1 | evt-pay-pub-start | e-pay-pub | edge | edge.started | 1030 | 2000 | null | null | n-pay | n-pub | publishes |

Important detail:

- Raw table remains append-only.
- Duplicate retries may create duplicate physical rows.
- Replay query groups by `event_id` and uses latest `received_at_ms`.

## Step 5: Event Bus Publishes Dirty Trace

Code path:

- `carno.js/src/infra/events/EventBus.ts`
- `carno.js/src/infra/events/InMemoryEventBus.ts`

Event envelope:

```json
{
  "type": "trace.events.ingested",
  "idempotencyKey": "trace.events.ingested:evt-card-end,evt-pay-start,...",
  "occurredAtUnixMs": 2001,
  "payload": {
    "traceIds": ["trace-1"],
    "eventCount": 16
  }
}
```

State beside code:

| Code | State |
| --- | --- |
| `toEnvelope(event)` | fills `occurredAtUnixMs` and `idempotencyKey` if missing |
| `seenKeys.has(key)` | duplicate publish returns early |
| `seenKeys.set(key, expiresAt)` | key kept until TTL |
| `queueMicrotask(handler)` | worker handler runs async; ingest response is not blocked by materialization |

Rule:

- App code does not manually dedupe events.
- Event bus internals own idempotency behavior.
- Kafka version later should keep same rule.

## Step 6: Worker Queues Trace Id

Code path:

- `TraceReadModelWorker.start`
- `eventBus.subscribe("trace.events.ingested", handler)`
- `enqueueTraceIds`
- `drainPendingTraceIds`

State beside code:

| Moment | Worker state |
| --- | --- |
| App boot | subscribed to `trace.events.ingested` |
| Event received | `pendingTraceIds = Set(["trace-1"])` |
| Debounce timer set | waits 25ms for more events |
| Drain starts | `isProcessing = true` |
| Batch selected | `traceIds = ["trace-1"]` |
| Batch done | `pendingTraceIds = Set([])`, `isProcessing = false` |

Recovery path:

```text
setInterval(processBatch, TRACE_MATERIALIZER_RECOVERY_INTERVAL_MS)
  -> RawEventRepository.listTraceIdsNeedingMaterialization(batchSize)
  -> enqueueTraceIds(traceIds)
```

Recovery exists because current in-memory bus is not durable.

## Step 7: Worker Replays Raw Events

Code path:

- `TraceReadModelWorker.materializeTrace`
- `RawEventRepository.getTraceEvents(traceId)`

Replay query behavior:

1. Filter raw rows by `trace_id`.
2. Group duplicate physical rows by `event_id`.
3. Use `argMax(..., received_at_ms)` for newest retry row.
4. Order by first receive time and event id.

Replay state example:

```json
[
  {
    "eventId": "evt-root-start",
    "traceId": "trace-1",
    "entityId": "n-root",
    "entityType": "node",
    "eventType": "node.started",
    "occurredAtUnixMs": 1000,
    "receivedAtUnixMs": 2000,
    "name": "POST /checkout",
    "importanceLevel": 0,
    "parentId": null,
    "data": { "service": "checkout-api" }
  },
  {
    "eventId": "evt-root-end",
    "traceId": "trace-1",
    "entityId": "n-root",
    "entityType": "node",
    "eventType": "node.ended",
    "occurredAtUnixMs": 1090,
    "receivedAtUnixMs": 2000,
    "status": "ok",
    "data": {}
  }
]
```

## Step 8: Builder Folds Events Into Drafts

Code path:

- `TraceReadModelBuilder.build`
- `applyNodeEvent`
- `applyEdgeEvent`
- `applyStatusAndTime`

Builder first makes drafts.

Node draft state after folding:

| id | parentId | name | importance | status | start | end | data |
| --- | --- | --- | ---: | --- | ---: | ---: | --- |
| n-root | null | POST /checkout | 0 | ok | 1000 | 1090 | `{ service: "checkout-api" }` |
| n-pay | n-root | payment service | 1 | ok | 1010 | 1080 | `{ service: "payment" }` |
| n-card | n-pay | authorize card | 3 | ok | 1020 | 1040 | `{ provider: "stripe" }` |
| n-pub | n-root | publish receipt | 2 | ok | 1050 | 1060 | `{ topic: "receipt.created" }` |

Edge draft state after folding:

| id | from | to | label | status | start | end |
| --- | --- | --- | --- | --- | ---: | ---: |
| e-root-pay | n-root | n-pay | continues | ok | 1010 | 1011 |
| e-pay-card | n-pay | n-card | continues | ok | 1020 | 1021 |
| e-root-pub | n-root | n-pub | continues | ok | 1050 | 1051 |
| e-pay-pub | n-pay | n-pub | publishes | ok | 1030 | 1031 |

Rules:

- Start time is earliest `.started`.
- End time is latest `.ended`.
- If a node lacks start/end, diagnostic is added.
- Missing edge end is valid open async edge.

## Step 9: Builder Computes Ancestry

Code path:

- `computeAncestry`

Definition:

- `parentId` is direct parent only.
- `ancestryPath` is all ancestors from root to direct parent.
- root node gets `[]`.
- direct child of root gets `[rootId]`.
- grandchild gets `[rootId, parentId]`.

State:

| node | parentId | ancestryPath | indentLevel |
| --- | --- | --- | ---: |
| n-root | null | `[]` | 0 |
| n-pay | n-root | `[n-root]` | 1 |
| n-card | n-pay | `[n-root, n-pay]` | 2 |
| n-pub | n-root | `[n-root]` | 1 |

Step-by-step for `n-card`:

| Operation | Value |
| --- | --- |
| start at `n-card.parentId` | `n-pay` |
| visit parent `n-pay` | parent ancestry is `[n-root]` |
| append parent id | `[n-root, n-pay]` |
| set `indentLevel` | `2` |

Diagnostics from ancestry:

| Problem | Diagnostic |
| --- | --- |
| parent id points to missing node | `orphanNode` |
| parent chain cycles | `cycleDetected` |

Frontend no longer uses `indentLevel` for placement. Projection still uses
`ancestryPath` to place hidden nodes under nearest visible ancestor.

Read-optimized table stores the same data as ClickHouse array:

| ClickHouse column | Value for `n-card` |
| --- | --- |
| `parent_id` | `n-pay` |
| `ancestry_path` | `["n-root", "n-pay"]` |
| `indent_level` | `2` |

Nearest visible ancestor query idea:

```sql
arrayFirst(
  ancestor_id -> has(visible_ids.ids, ancestor_id),
  arrayReverse(ancestry_path)
)
```

For `n-card`:

| Slider | visible ids | `arrayReverse(ancestry_path)` | nearest visible ancestor |
| ---: | --- | --- | --- |
| 0 | `[n-root]` | `[n-pay, n-root]` | `n-root` |
| 1 | `[n-root, n-pay]` | `[n-pay, n-root]` | `n-pay` |
| 3 | `[n-root, n-pay, n-card, n-pub]` | not needed | node itself visible |

Why reverse:

- Original path is root -> parent.
- Nearest visible ancestor should prefer direct parent before root.
- Reverse turns it into parent -> root.

Ghost grouping uses that nearest visible ancestor:

| Hidden node | nearest visible ancestor | ghost id |
| --- | --- | --- |
| `n-card` at slider `1` | `n-pay` | `ghost:n-pay` |
| `n-card` at slider `0` | `n-root` | `ghost:n-root` |

If no visible ancestor exists, group key becomes `__root__` and ghost id becomes
`ghost:__root__`.

Edge lifting uses endpoint node ancestry:

| Edge | Slider | from endpoint resolves to | to endpoint resolves to |
| --- | ---: | --- | --- |
| `n-pay -> n-card` | 1 | `n-pay` | `ghost:n-pay` |
| `n-pay -> n-card` | 0 | `ghost:n-root` | `ghost:n-root` |

When both resolved endpoints are same, backend drops that edge. It would be a
ghost self-edge and adds noise.

## Step 10: Builder Computes Flow Order

Code path:

- `computeFlowOrder`

Inputs:

- Parent links: root -> payment, payment -> card, root -> publish.
- Explicit edges: payment -> publish.

Topological order output:

| node | flowOrder | why |
| --- | ---: | --- |
| n-root | 0 | root has no incoming causal dependency |
| n-pay | 1 | child of root |
| n-card | 2 | child of payment |
| n-pub | 3 | child of root and target of payment publishes edge |

If cycles remain after topological sort:

- builder appends cyclic nodes after sorted nodes
- nodes get `cycleDetected`

## Step 11: Builder Emits Read Model

Code path:

- `TraceReadModelBuilder.build`

Read node example:

```json
{
  "id": "n-pay",
  "traceId": "trace-1",
  "parentId": "n-root",
  "name": "payment service",
  "importanceLevel": 1,
  "status": "ok",
  "startedAtUnixMs": 1010,
  "endedAtUnixMs": 1080,
  "durationMs": 70,
  "ancestryPath": ["n-root"],
  "indentLevel": 1,
  "flowOrder": 1,
  "diagnostics": [],
  "data": { "service": "payment" }
}
```

Summary state:

```json
{
  "traceId": "trace-1",
  "createdAtUnixMs": 1000,
  "updatedAtUnixMs": 1090,
  "nodeCount": 4,
  "edgeCount": 4,
  "errorCount": 0,
  "diagnosticCount": 0,
  "maxImportanceLevel": 3,
  "materializedAtUnixMs": 2002
}
```

`materializedAtUnixMs` is monotonic inside builder, so two fast materializations
do not tie.

## Step 12: Read Model Is Saved

Code path:

- `ReadModelRepository.saveTraceReadModel`
- tables:
  - `node_read_nodes`
  - `node_read_edges`
  - `node_trace_summary`

Read node table state:

| trace_id | id | importance_level | status | flow_order | materialized_at_ms |
| --- | --- | ---: | --- | ---: | ---: |
| trace-1 | n-root | 0 | ok | 0 | 2002 |
| trace-1 | n-pay | 1 | ok | 1 | 2002 |
| trace-1 | n-card | 3 | ok | 2 | 2002 |
| trace-1 | n-pub | 2 | ok | 3 | 2002 |

Read edge table state:

| trace_id | id | from_node_id | to_node_id | label | status |
| --- | --- | --- | --- | --- | --- |
| trace-1 | e-root-pay | n-root | n-pay | continues | ok |
| trace-1 | e-pay-card | n-pay | n-card | continues | ok |
| trace-1 | e-root-pub | n-root | n-pub | continues | ok |
| trace-1 | e-pay-pub | n-pay | n-pub | publishes | ok |

No separate ancestry index is written. `ancestry_path Array(String)` lives on
`node_read_nodes` and is used directly by graph projection SQL.

## Step 13: Trace List Read

Code path:

- `GET /telemetry/traces`
- `LogController.listTraces`
- `LogService.listTraces`
- `ReadModelRepository.listTraces`

Query state:

- groups `node_trace_summary` by `trace_id`
- uses `argMax(..., materialized_at_ms)` for latest fields
- orders by `updated_at_ms DESC`

Response:

```json
{
  "traces": [
    {
      "traceId": "trace-1",
      "nodeCount": 4,
      "edgeCount": 4,
      "errorCount": 0,
      "diagnosticCount": 0,
      "maxImportanceLevel": 3,
      "materializedAtUnixMs": 2002
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

Frontend state:

| Code path | State |
| --- | --- |
| `fetchTraces()` | GET `/telemetry/traces?page=1&limit=20` |
| `TraceRail` | shows `trace-1`, `4 nodes`, `max 3` |

## Step 14: Graph Read Starts

Code path:

- frontend `fetchGraph`
- `GET /telemetry/traces/trace-1/graph?maxImportance=1&limit=250`
- `LogController.getGraph`
- `LogService.getGraph`

Service loads summary first, then asks repository for one projected graph
window:

```ts
const summary = await readModels.getSummary(traceId);
const projected = await readModels.getProjectedGraph({
  traceId,
  maxImportance,
  limit,
  offset,
});
```

Repository projection state:

```json
{
  "summary": { "traceId": "trace-1", "nodeCount": 4, "maxImportanceLevel": 3 },
  "requestedWindow": { "maxImportance": 1, "limit": 250, "offset": 0 },
  "dbWork": [
    "latest node rows",
    "visible id array",
    "hidden ghost groups",
    "projected node window",
    "lifted edges for returned node ids"
  ]
}
```

## Step 15: Importance Threshold Is Clamped

Code path:

- `clampImportance(query.maxImportance, summary.maxImportanceLevel)`

Examples:

| Request value | Summary max | Effective `maxImportance` |
| ---: | ---: | ---: |
| missing | 3 | 2 |
| -5 | 3 | 0 |
| 1 | 3 | 1 |
| 99 | 3 | 3 |

Limit is clamped too:

| Request limit | Effective limit |
| ---: | ---: |
| missing | 250 |
| 0 | 1 |
| 1000 | 500 |

## Step 16: Projection With `maxImportance = 3`

Code path:

- `ReadModelRepository.getProjectedGraph({ maxImportance: 3 })`
- ClickHouse CTE `visible_ids`
- ClickHouse projected node union
- ClickHouse resolved edge query

Visible rule:

```ts
node.importanceLevel <= maxImportance
```

State:

| Node | Importance | Visible? |
| --- | ---: | --- |
| n-root | 0 | yes |
| n-pay | 1 | yes |
| n-card | 3 | yes |
| n-pub | 2 | yes |

Returned nodes:

```json
["n-root", "n-pay", "n-card", "n-pub"]
```

Returned edges:

```json
[
  "n-root -> n-pay continues",
  "n-pay -> n-card continues",
  "n-root -> n-pub continues",
  "n-pay -> n-pub publishes"
]
```

Metadata:

```json
{
  "returnedNodeCount": 4,
  "totalNodeCount": 4,
  "hiddenNodeCount": 0,
  "ghostNodeCount": 0
}
```

## Step 17: Projection With `maxImportance = 1`

State:

| Node | Importance | Visible? | Nearest visible ancestor if hidden |
| --- | ---: | --- | --- |
| n-root | 0 | yes | n/a |
| n-pay | 1 | yes | n/a |
| n-card | 3 | no | n-pay |
| n-pub | 2 | no | n-root |

Hidden groups:

| Group key | Hidden nodes | Ghost id |
| --- | --- | --- |
| n-pay | n-card | `ghost:n-pay` |
| n-root | n-pub | `ghost:n-root` |

Ghost state:

```json
[
  {
    "id": "ghost:n-pay",
    "parentId": "n-pay",
    "name": "1 hidden less-important node",
    "importanceLevel": 2,
    "hiddenNodeCount": 1,
    "hiddenErrorCount": 0
  },
  {
    "id": "ghost:n-root",
    "parentId": "n-root",
    "name": "1 hidden less-important node",
    "importanceLevel": 2,
    "hiddenNodeCount": 1,
    "hiddenErrorCount": 0
  }
]
```

Edge lifting:

| Raw edge | Endpoint resolution | Returned edge |
| --- | --- | --- |
| n-root -> n-pay `continues` | both visible | n-root -> n-pay |
| n-pay -> n-card `continues` | n-card -> `ghost:n-pay` | n-pay -> ghost:n-pay |
| n-root -> n-pub `continues` | n-pub -> `ghost:n-root` | n-root -> ghost:n-root |
| n-pay -> n-pub `publishes` | n-pub -> `ghost:n-root` | n-pay -> ghost:n-root |

Returned graph:

```json
{
  "nodes": ["n-root", "n-pay", "ghost:n-pay", "ghost:n-root"],
  "edges": [
    "n-root -> n-pay continues",
    "n-pay -> ghost:n-pay continues",
    "n-root -> ghost:n-root continues",
    "n-pay -> ghost:n-root publishes"
  ],
  "metadata": {
    "maxImportance": 1,
    "returnedNodeCount": 4,
    "totalNodeCount": 4,
    "hiddenNodeCount": 2,
    "ghostNodeCount": 2
  }
}
```

## Step 18: Projection With `maxImportance = 0`

State:

| Node | Importance | Visible? | Nearest visible ancestor |
| --- | ---: | --- | --- |
| n-root | 0 | yes | n/a |
| n-pay | 1 | no | n-root |
| n-card | 3 | no | n-root |
| n-pub | 2 | no | n-root |

Hidden groups:

| Group key | Hidden nodes | Ghost id |
| --- | --- | --- |
| n-root | n-pay, n-card, n-pub | `ghost:n-root` |

Returned graph:

```json
{
  "nodes": ["n-root", "ghost:n-root"],
  "edges": [
    "n-root -> ghost:n-root continues"
  ],
  "metadata": {
    "maxImportance": 0,
    "returnedNodeCount": 2,
    "totalNodeCount": 4,
    "hiddenNodeCount": 3,
    "ghostNodeCount": 1
  }
}
```

Why only one edge:

- Edges where both endpoints collapse to same ghost are skipped.
- This prevents noisy self edges like `ghost:n-root -> ghost:n-root`.
- Existing parallel lifted edges with same `from -> to : label` are grouped.

## Step 19: Cursor Windowing

Code path:

- `decodeCursor(query.cursor)`
- `projected.nodes.slice(offset, offset + limit)`
- edge filter by returned node ids

Example with `limit = 2`, `maxImportance = 1`:

Projected nodes before window:

```json
["n-root", "n-pay", "ghost:n-pay", "ghost:n-root"]
```

First response:

```json
{
  "nodes": ["n-root", "n-pay"],
  "edges": ["n-root -> n-pay continues"],
  "metadata": {
    "hasBefore": false,
    "hasAfter": true,
    "previousCursor": null,
    "nextCursor": "Mg"
  }
}
```

Second response with cursor `Mg`:

```json
{
  "nodes": ["ghost:n-pay", "ghost:n-root"],
  "edges": [],
  "metadata": {
    "hasBefore": true,
    "hasAfter": false,
    "previousCursor": "MA",
    "nextCursor": null
  }
}
```

Edges are only returned when both endpoints are inside the current node window.

## Step 20: Response Sent To Frontend

Code path:

- `LogService.getGraph`
- `Response.json(...)` through Carno
- frontend `fetchGraph`

Response shape:

```json
{
  "metadata": {
    "traceId": "trace-1",
    "maxImportance": 1,
    "limit": 250,
    "returnedNodeCount": 4,
    "totalNodeCount": 4,
    "hiddenNodeCount": 2,
    "ghostNodeCount": 2,
    "hasBefore": false,
    "hasAfter": false,
    "previousCursor": null,
    "nextCursor": null
  },
  "summary": {
    "traceId": "trace-1",
    "nodeCount": 4,
    "edgeCount": 4,
    "maxImportanceLevel": 3
  },
  "nodes": [
    { "id": "n-root", "importanceLevel": 0, "flowOrder": 0 },
    { "id": "n-pay", "importanceLevel": 1, "flowOrder": 1 },
    { "id": "ghost:n-pay", "isGhost": true, "hiddenNodeCount": 1 },
    { "id": "ghost:n-root", "isGhost": true, "hiddenNodeCount": 1 }
  ],
  "edges": [
    { "fromNodeId": "n-root", "toNodeId": "n-pay", "label": "continues" },
    { "fromNodeId": "n-pay", "toNodeId": "ghost:n-pay", "label": "continues", "isGhost": true },
    { "fromNodeId": "n-root", "toNodeId": "ghost:n-root", "label": "continues", "isGhost": true },
    { "fromNodeId": "n-pay", "toNodeId": "ghost:n-root", "label": "publishes", "isGhost": true }
  ]
}
```

## Step 21: Frontend Lays Out Graph

Code path:

- `frontend/src/api.ts`
- `frontend/src/ui/App.tsx`
- `GraphCanvas`
- `buildImportanceLayout`

Frontend layout rule:

```text
x = BOARD_PADDING + importanceLevel * COLUMN_GAP
y = BOARD_PADDING + 46 + rowWithinImportance * ROW_GAP
```

Layout state for `maxImportance = 1`:

| Node | Importance | Column x | Row y |
| --- | ---: | ---: | ---: |
| n-root | 0 | i0 column | first row |
| n-pay | 1 | i1 column | first row |
| ghost:n-pay | 2 | i2 column | first row |
| ghost:n-root | 2 | i2 column | second row |

Visual state:

| UI element | Data source |
| --- | --- |
| trace rail row | `TraceSummary` from `/telemetry/traces` |
| graph header stats | `GraphWindowResponse.metadata` and `summary` |
| node card title/status/duration | `ReadNode` or `GhostNode` |
| edge curve/label | `GraphEdge` |
| inspector | selected node/edge object |

Frontend does not decide visibility. Backend already projected visible nodes,
ghost nodes, lifted edges, and metadata.

## Step 22: What Changes When Slider Moves

Slider movement:

```text
user moves slider
  -> setMaxImportance(value)
  -> cursor resets to null
  -> React Query refetches graph with new maxImportance
  -> backend re-runs DB-side importance projection
  -> frontend lays out returned graph
```

State comparison:

| Slider | Backend visible nodes | Ghost nodes | UI columns used |
| ---: | --- | --- | --- |
| 0 | n-root | ghost:n-root | i0, i1 |
| 1 | n-root, n-pay | ghost:n-pay, ghost:n-root | i0, i1, i2 |
| 2 | n-root, n-pay, n-pub | ghost:n-pay | i0, i1, i2 |
| 3 | n-root, n-pay, n-card, n-pub | none | i0, i1, i2, i3 |

Important:

- Importance controls detail level only.
- Importance does not mean call depth.
- `ancestryPath` controls ghost grouping.
- `flowOrder` controls stable ordering.
- Frontend columns are a visual choice based on returned importance levels.

## Code Ownership Map

| Concern | File | Function/class |
| --- | --- | --- |
| SDK node lifecycle | `sdk/nodejs/src/Span.ts` | `TraceNode` |
| SDK edge lifecycle | `sdk/nodejs/src/Tracer.ts` | `connect`, `endEdge` |
| SDK batching | `sdk/nodejs/src/BatchExporter.ts` | `addEvent`, `flush` |
| HTTP controller | `carno.js/src/routes/LogController.ts` | `ingestEvents`, `getGraph` |
| App orchestration | `carno.js/src/services/log/LogService.ts` | `ingestEvents`, `getGraph` |
| Raw append/replay | `carno.js/src/services/log/RawEventRepository.ts` | `append`, `getTraceEvents` |
| Event bus contract | `carno.js/src/infra/events/EventBus.ts` | `EventBusPort`, `EventBus` |
| Dev event bus | `carno.js/src/infra/events/InMemoryEventBus.ts` | `publish`, `subscribe` |
| Worker | `carno.js/src/services/log/worker/TraceReadModelWorker.ts` | `processBatch`, `materializeTrace` |
| Read model build | `carno.js/src/services/log/TraceReadModelBuilder.ts` | `build` |
| Read table writes/reads | `carno.js/src/services/log/ReadModelRepository.ts` | `saveTraceReadModel`, `getNodes`, `getEdges` |
| ClickHouse schema | `carno.js/src/infra/ClickHouseService.ts` | `runMigrations` |
| Frontend API | `frontend/src/api.ts` | `fetchTraces`, `fetchGraph` |
| Frontend graph layout | `frontend/src/ui/App.tsx` | `buildImportanceLayout` |

## Short Mental Model

```text
Write path:
events are facts -> raw table -> trace dirty event -> worker -> read tables

Read path:
read tables -> latest rows -> importance projection -> graph response -> UI layout

Importance:
lower number = more important
threshold keeps <= N
hidden nodes become ghost nodes
edges are lifted through visible/ghost endpoints
```

<!-- refreshed: 2026-06-04 -->
# Architecture

**Analysis Date:** 2026-06-04

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Product Surfaces                          │
├──────────────────┬──────────────────┬───────────────────────┤
│   Node SDK       │   Carno API      │    React Frontend      │
│ `sdk/nodejs/src` │ `carno.js/src`   │ `frontend/src`         │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Trace Event + Read Model Pipeline               │
│ `carno.js/src/services/log`                                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  ClickHouse raw events and materialized graph projections     │
│  `carno.js/src/infra/ClickHouseService.ts`                    │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Node SDK public API | Starts traces, creates nodes, emits explicit edges, and batches lifecycle events to the backend. | `sdk/nodejs/src/Tracer.ts`, `sdk/nodejs/src/Span.ts`, `sdk/nodejs/src/BatchExporter.ts` |
| Carno application bootstrap | Registers DI services, repositories, materializer worker, and telemetry controller, then listens on `PORT` or `3999`. | `carno.js/src/index.ts` |
| Telemetry HTTP controller | Owns `/telemetry/events`, `/telemetry/traces`, `/telemetry/traces/:traceId/summary`, `/telemetry/traces/:traceId/graph`, and `/telemetry/materialize`. | `carno.js/src/routes/LogController.ts` |
| Log service | Validates event batches, coordinates raw writes, publishes dirty-trace events, clamps graph query inputs, and shapes graph metadata. | `carno.js/src/services/log/LogService.ts` |
| Raw event repository | Appends immutable lifecycle events and replays trace-scoped event streams from ClickHouse. | `carno.js/src/services/log/RawEventRepository.ts` |
| Event bus | Publishes `trace.events.ingested` and dispatches subscribers with in-memory idempotency. | `carno.js/src/infra/events/EventBus.ts`, `carno.js/src/infra/events/InMemoryEventBus.ts` |
| Read model worker | Subscribes to dirty-trace events, debounces materialization, runs recovery scans, and saves rebuilt read models. | `carno.js/src/services/log/worker/TraceReadModelWorker.ts` |
| Read model builder | Replays raw node/edge events into `ReadNode`, `ReadEdge`, `TraceSummary`, diagnostics, and `flowOrder`. | `carno.js/src/services/log/TraceReadModelBuilder.ts` |
| Read model repository | Writes read-optimized tables, lists traces, returns summaries, projects visible graph windows, and creates ghost nodes for filtered detail. | `carno.js/src/services/log/ReadModelRepository.ts` |
| Frontend API client | Fetches trace lists, summaries, and graph windows from `VITE_API_BASE_URL` or `http://localhost:3999`. | `frontend/src/api.ts` |
| Frontend workspace | Provides trace rail, graph canvas, inspector, route state, React Query state, and React Flow layout. | `frontend/src/main.tsx`, `frontend/src/ui/App.tsx` |
| Hono server scaffold | Cloudflare Worker-oriented service/repository architecture scaffold with ClickHouse middleware, auth service, and log write path; root route only is mounted. | `hono-server/src/index.ts`, `hono-server/src/services`, `hono-server/src/infra` |

## Pattern Overview

**Overall:** Event-sourced trace ingestion with rebuildable ClickHouse read models and a thin graph workspace frontend.

**Key Characteristics:**
- Nodes and edges are immutable lifecycle events at ingestion time; graph relationships come only from explicit edge events emitted by `sdk/nodejs/src/Tracer.ts` and `sdk/nodejs/src/Span.ts`.
- The write path is append-only in `carno.js/src/services/log/RawEventRepository.ts`; reads use rebuildable `ReplacingMergeTree` projections created by `carno.js/src/services/log/TraceReadModelBuilder.ts`.
- Backend application logic is split into controller, service, repositories, projector, worker, and infrastructure ports under `carno.js/src`.
- Frontend state is server-cache driven with React Query in `frontend/src/ui/App.tsx`; graph layout is a client-side projection over backend `GraphWindowResponse`.
- `hono-server/src` follows a separate service API/internal/repo/impl convention, but `hono-server/src/index.ts` only registers ClickHouse middleware and `GET /`.

## Layers

**SDK Layer:**
- Purpose: Provide instrumentation primitives to application code.
- Location: `sdk/nodejs/src`
- Contains: `Tracer`, `TraceNode`/`Span`, `BatchExporter`, event types, importance normalization.
- Depends on: `uuid`, global `fetch`, Node timers.
- Used by: Example trace scripts in `sdk/nodejs/example` and any instrumented Node app.

**HTTP/API Layer:**
- Purpose: Expose telemetry ingestion and graph read endpoints.
- Location: `carno.js/src/routes`
- Contains: Controller decorators and query/body parameter mapping.
- Depends on: `LogService`, `TraceReadModelWorker`, `@carno.js/core`.
- Used by: SDK `BatchExporter` and frontend `frontend/src/api.ts`.

**Application Service Layer:**
- Purpose: Own input validation, query clamping, pagination cursor encoding, and orchestration between repositories and domain events.
- Location: `carno.js/src/services/log/LogService.ts`
- Contains: `ingestEvents`, `listTraces`, `getTraceSummary`, `getGraph`, validation helpers.
- Depends on: `RawEventRepository`, `ReadModelRepository`, `EventBus`.
- Used by: `carno.js/src/routes/LogController.ts`.

**Persistence Layer:**
- Purpose: Isolate ClickHouse writes, replay queries, materialized read writes, summary reads, and graph projection queries.
- Location: `carno.js/src/services/log/RawEventRepository.ts`, `carno.js/src/services/log/ReadModelRepository.ts`, `carno.js/src/infra/ClickHouseService.ts`
- Contains: Table migrations, insert calls, query mappers, projection helpers.
- Depends on: `@clickhouse/client`.
- Used by: `LogService` and `TraceReadModelWorker`.

**Materialization Layer:**
- Purpose: Convert raw events into a read model after ingestion.
- Location: `carno.js/src/services/log/TraceReadModelBuilder.ts`, `carno.js/src/services/log/worker/TraceReadModelWorker.ts`
- Contains: Event replay, lifecycle finalization, diagnostics, topological ordering, dirty-trace queue, recovery scan.
- Depends on: `EventBus`, raw/read repositories.
- Used by: Application lifecycle hooks and manual `POST /telemetry/materialize`.

**Infrastructure Layer:**
- Purpose: Provide database and event bus adapters.
- Location: `carno.js/src/infra`
- Contains: ClickHouse client/migrations and in-memory event bus implementation.
- Depends on: `@clickhouse/client`, `@carno.js/core`.
- Used by: Bootstrap and services.

**Frontend Layer:**
- Purpose: Render a trace-list, graph canvas, and inspector from backend graph windows.
- Location: `frontend/src`
- Contains: API client, React entry point, React Flow workspace, shared frontend types, CSS.
- Depends on: React, React Query, React Flow, Vite.
- Used by: Browser clients.

**Alternative Worker/Hono Layer:**
- Purpose: Cloudflare Worker-oriented backend scaffold using Hono, explicit API/internal service boundaries, and ClickHouse Web client middleware.
- Location: `hono-server/src`
- Contains: `common`, `infra`, `services/auth`, `services/log`.
- Depends on: Hono, `@clickhouse/client-web`, Wrangler.
- Used by: `hono-server/src/index.ts`; telemetry routes are not mounted in the current entry point.

## Data Flow

### Primary Request Path

1. SDK user code calls `Tracer.startTrace` or `TraceNode.startNode`; constructors emit `node.started` events (`sdk/nodejs/src/Tracer.ts:15`, `sdk/nodejs/src/Span.ts:27`).
2. SDK code calls `TraceNode.connectTo` or `Tracer.connect`; explicit `edge.started` and optional `edge.ended` events are queued (`sdk/nodejs/src/Span.ts:57`, `sdk/nodejs/src/Tracer.ts:39`).
3. `BatchExporter.flush` posts queued events to `POST /telemetry/events` (`sdk/nodejs/src/BatchExporter.ts:48`).
4. `LogController.ingestEvents` receives the batch and delegates to `LogService.ingestEvents` (`carno.js/src/routes/LogController.ts:13`, `carno.js/src/services/log/LogService.ts:25`).
5. `RawEventRepository.append` inserts rows into `topo_tracer.node_trace_events` (`carno.js/src/services/log/RawEventRepository.ts:11`).
6. `LogService.ingestEvents` publishes `trace.events.ingested` on the event bus (`carno.js/src/services/log/LogService.ts:25`).
7. `TraceReadModelWorker` subscribes on app startup, queues dirty trace ids, and materializes batches (`carno.js/src/services/log/worker/TraceReadModelWorker.ts:22`, `carno.js/src/services/log/worker/TraceReadModelWorker.ts:58`).
8. `TraceReadModelBuilder.build` replays raw events into nodes, edges, summary, diagnostics, and `flowOrder` (`carno.js/src/services/log/TraceReadModelBuilder.ts:41`).
9. `ReadModelRepository.saveTraceReadModel` writes `node_read_nodes`, `node_read_edges`, and `node_trace_summary` (`carno.js/src/services/log/ReadModelRepository.ts:64`).
10. Frontend `fetchGraph` requests `/telemetry/traces/:traceId/graph` and `LogService.getGraph` returns a projected `GraphWindowResponse` (`frontend/src/api.ts:14`, `carno.js/src/services/log/LogService.ts:51`).
11. `App` stores route/query state, and `TraceGraphCanvas` renders React Flow nodes/edges from `buildFlowData` (`frontend/src/ui/App.tsx:34`, `frontend/src/ui/App.tsx:236`, `frontend/src/ui/App.tsx:386`).

### Graph Read Flow

1. `frontend/src/ui/App.tsx` uses React Query keys `["traces"]` and `["graph", activeTraceId, maxImportance, cursor]` to call `frontend/src/api.ts`.
2. `LogController.getGraph` parses `maxImportance`, `limit`, and `cursor` into `GraphWindowQuery` (`carno.js/src/routes/LogController.ts:31`).
3. `LogService.getGraph` loads the latest trace summary, clamps importance and limit, decodes the cursor, and calls `ReadModelRepository.getProjectedGraph` (`carno.js/src/services/log/LogService.ts:51`).
4. `ReadModelRepository.getProjectedGraph` loads latest materialized nodes/edges, filters by `importanceLevel`, creates `ghost:hidden:N` nodes for hidden runs, windows by `flowOrder`, and lifts edges to visible or ghost endpoints (`carno.js/src/services/log/ReadModelRepository.ts:208`).
5. `frontend/src/ui/App.tsx` lays out the returned graph with `layoutNodes` and does not infer links from node ids or nesting (`frontend/src/ui/App.tsx:435`).

**State Management:**
- Backend durable state lives in ClickHouse tables created by `carno.js/src/infra/ClickHouseService.ts`.
- Backend process state is limited to DI singletons, the in-memory event bus idempotency map, and the materializer worker's timers/queue in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`.
- Frontend UI state is local React state in `frontend/src/ui/App.tsx`; server data cache is React Query from `frontend/src/main.tsx`.
- SDK state is a static `BatchExporter` singleton on `Tracer` in `sdk/nodejs/src/Tracer.ts`.

## Key Abstractions

**Trace Events:**
- Purpose: Immutable write-side facts for node and edge lifecycle transitions.
- Examples: `sdk/nodejs/src/types.ts`, `carno.js/src/services/log/types.ts`, `carno.js/src/services/log/RawEventRepository.ts`
- Pattern: Append-only event stream with stable event ids and retry collapse during replay.

**Explicit Graph Edges:**
- Purpose: Represent causal links between nodes; no parent id or implicit nesting exists.
- Examples: `sdk/nodejs/src/Tracer.ts`, `sdk/nodejs/src/Span.ts`, `docs/TRACE_DESIGN.md`
- Pattern: Edge lifecycle events are separate entities with `fromNodeId`, `toNodeId`, and `label`.

**Read Model Projector:**
- Purpose: Rebuild a trace's latest read nodes, read edges, and summary from raw events.
- Examples: `carno.js/src/services/log/contracts.ts`, `carno.js/src/services/log/TraceReadModelBuilder.ts`
- Pattern: Pure-ish projector class plus repository save; builder keeps only monotonic materialization timestamp state.

**Graph Projection:**
- Purpose: Convert materialized nodes/edges into a frontend window that respects importance filtering.
- Examples: `carno.js/src/services/log/ReadModelRepository.ts`, `frontend/src/types.ts`
- Pattern: Backend creates ghost nodes/edges for hidden detail; frontend renders returned nodes/edges directly.

**Infrastructure Ports:**
- Purpose: Decouple services from event bus and repository contracts.
- Examples: `carno.js/src/infra/events/EventBus.ts`, `carno.js/src/services/log/contracts.ts`, `hono-server/src/infra/event-bus/api/IEventBus.ts`
- Pattern: Abstract class or TypeScript interface contract with concrete in-memory/development implementation.

## Entry Points

**Carno API Server:**
- Location: `carno.js/src/index.ts`
- Triggers: `bun run dev`, `bun run src/index.ts`, or equivalent Bun execution.
- Responsibilities: Configure CORS/validation, register services/controllers, initialize ClickHouse, start materializer worker, listen on `PORT` or `3999`.

**Telemetry Controller:**
- Location: `carno.js/src/routes/LogController.ts`
- Triggers: HTTP requests under `/telemetry`.
- Responsibilities: Map request bodies/path/query params to `LogService` calls and expose manual materialization.

**Frontend App:**
- Location: `frontend/src/main.tsx`
- Triggers: Vite-served browser load.
- Responsibilities: Create React root, install React Query provider, render `App`.

**Node SDK Package:**
- Location: `sdk/nodejs/src/index.ts`
- Triggers: Consumer imports.
- Responsibilities: Re-export public tracing types and classes from `types`, `Span`, and `Tracer`.

**Hono Worker Scaffold:**
- Location: `hono-server/src/index.ts`
- Triggers: `wrangler dev` or `wrangler deploy`.
- Responsibilities: Create a Hono app, attach ClickHouse middleware, and serve `GET /`; service modules under `hono-server/src/services` are not routed by this entry point.

## Architectural Constraints

- **Threading:** The runtime model is single-process JavaScript. The materializer uses timers, microtasks, and an `isProcessing` guard in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`; there are no worker threads.
- **Global state:** `Tracer.exporter` in `sdk/nodejs/src/Tracer.ts`, `ClickHouseService.clientInstance` in `carno.js/src/infra/ClickHouseService.ts`, event bus maps in `carno.js/src/infra/events/InMemoryEventBus.ts`, and worker queues/timers in `carno.js/src/services/log/worker/TraceReadModelWorker.ts` are process-local.
- **Circular imports:** The SDK has a bidirectional module relationship between `sdk/nodejs/src/Tracer.ts` and `sdk/nodejs/src/Span.ts`; `Tracer` imports `TraceNode`, and `Span` imports `Tracer`. Keep constructor side effects and static access stable when editing either file.
- **Graph model:** Do not add `parentId`, ancestry paths, or implicit nesting to node records. Edges are the only graph links, per `docs/TRACE_DESIGN.md` and `docs/TRACE_FLOW_CODE_LEVEL.md`.
- **Read model freshness:** Read APIs depend on materialization. Ingestion returns after raw append and event publish; graph reads use the latest saved read model from `carno.js/src/services/log/ReadModelRepository.ts`.
- **ClickHouse query style:** Latest read rows use grouped `argMax(..., materialized_at_ms)` queries instead of `FINAL`, as shown in `carno.js/src/services/log/ReadModelRepository.ts`.

## Anti-Patterns

### Inferring Graph Links From Node Shape

**What happens:** Adding parent/child semantics to node ids, start order, route shape, or layout order creates links that the data model does not store.
**Why it's wrong:** `TraceReadModelBuilder.computeFlowOrder` and frontend `layoutNodes` depend on explicit edges; inferred links make SDK, backend, and UI disagree.
**Do this instead:** Emit edges through `TraceNode.connectTo` in `sdk/nodejs/src/Span.ts` or `Tracer.connect` in `sdk/nodejs/src/Tracer.ts`, then let `carno.js/src/services/log/TraceReadModelBuilder.ts` and `frontend/src/ui/App.tsx` consume those edges.

### Serving Raw Events Directly To The UI

**What happens:** A read endpoint bypasses `ReadModelRepository` and asks the frontend to replay lifecycle events.
**Why it's wrong:** Diagnostics, duration merging, duplicate event collapse, `flowOrder`, importance projection, ghost nodes, and windowing are backend read-model responsibilities.
**Do this instead:** Add read behavior to `carno.js/src/services/log/ReadModelRepository.ts` and expose it through `carno.js/src/services/log/LogService.ts`.

### Adding Mounted Logic Only Under `hono-server/src/services`

**What happens:** A service is implemented under `hono-server/src/services` and assumed to be reachable.
**Why it's wrong:** `hono-server/src/index.ts` only mounts ClickHouse middleware and `GET /`; service indexes are not wired to routes.
**Do this instead:** For the current product API, add endpoints under `carno.js/src/routes/LogController.ts`. For Hono-specific work, also mount routes explicitly in `hono-server/src/index.ts`.

## Error Handling

**Strategy:** Validation throws synchronous `Error` objects in service/controller paths, background workers log failures and keep running, SDK batches retry within a configured retry budget.

**Patterns:**
- Validate telemetry batches before persistence in `carno.js/src/services/log/LogService.ts`.
- Treat malformed JSON data as `{}` during replay/read mapping in `carno.js/src/services/log/RawEventRepository.ts` and `carno.js/src/services/log/ReadModelRepository.ts`.
- Record data-quality issues as diagnostics such as `missingStart`, `missingEnd`, `negativeDuration`, `cycleDetected`, `orphanEdge`, and `clockSkewSuspected` in `carno.js/src/services/log/TraceReadModelBuilder.ts`.
- Catch and log async event handler failures in `carno.js/src/infra/events/InMemoryEventBus.ts`.
- Requeue SDK batches on transient flush failure until `maxRetries` is exceeded in `sdk/nodejs/src/BatchExporter.ts`.

## Cross-Cutting Concerns

**Logging:** `carno.js` uses `console.log`, `console.error`, and `console.warn` in the worker/event bus/SDK. `hono-server/src/common/logger.ts` defines a `tslog` root logger for the Hono scaffold.
**Validation:** `carno.js/src/services/log/LogService.ts` performs explicit telemetry event validation; `carno.js/src/index.ts` enables Carno validation globally. Hono has environment helpers in `hono-server/src/common/env.ts`.
**Authentication:** Not applied to the active Carno telemetry API. Hono has an auth service scaffold under `hono-server/src/services/auth`, including `IAuthService`, `AuthServiceImpl`, and repository contracts.

---

*Architecture analysis: 2026-06-04*

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Topo Tracer Hono Read Models**

This project builds the read-optimized trace graph pipeline inside
`hono-server`. The source of truth is append-only node and edge event ingestion;
the read side materializes trace summaries, latest node state, latest edge
state, and importance-threshold graph projections that the UI can render without
replaying raw events.

This project intentionally ignores the older `carno.js` backend. New backend
behavior for this effort belongs in `hono-server/src`.

**Core Value:** Users can inspect very large traces by importance level without the backend or
UI loading the entire trace graph.

### Constraints

- **Backend scope**: Work only in `hono-server` — prevents divergence and avoids
  reviving the older backend.
- **Architecture guide**: Read and follow `hono-server/src/code-base.md` before
  planning or implementing Hono changes.
- **Storage**: Use ClickHouse read-optimized tables — the system is append-heavy
  and trace reads need aggregation over large telemetry datasets.
- **Graph model**: Edges are the only graph links — do not infer graph structure
  from node ids, ancestry paths, or start order.
- **Importance semantics**: Threshold mode only — visible means
  `importanceLevel <= selectedThreshold`.
- **Safety**: Read APIs must have hard caps — no request should fetch or return
  an entire million-node trace.
- **Materialization**: Resume from explicit checkpoint rows — do not infer event
  progress from read node/read edge state.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.x/6.x - All application packages use TypeScript source files: `carno.js/src/index.ts`, `frontend/src/main.tsx`, `hono-server/src/index.ts`, `sdk/nodejs/src/index.ts`.
- TSX/React JSX - Frontend UI components use React TSX in `frontend/src/ui/App.tsx`; Hono config enables JSX support through `hono/jsx` in `hono-server/tsconfig.json`.
- JSON/JSONC - Package and runtime configuration lives in `carno.js/package.json`, `frontend/package.json`, `sdk/nodejs/package.json`, `hono-server/package.json`, and `hono-server/wrangler.jsonc`.
- Markdown - Product and implementation docs live under `docs/`, including `docs/DEVELOPMENT_AND_VERIFICATION.md`, `docs/TRACE_DESIGN.md`, and `docs/BACKEND_SCHEMA_AND_QUERIES.md`.
## Runtime
- Bun - Primary local backend runtime for `carno.js`; run with `bun run --watch src/index.ts` from `carno.js/package.json`.
- Browser - Frontend runtime served by Vite from `frontend/vite.config.ts`; default dev server port is `5173`.
- Node.js - SDK package targets Node-style CommonJS output in `sdk/nodejs/tsconfig.json`; SDK uses `NodeJS.Timeout`, `setImmediate`, and global `fetch` in `sdk/nodejs/src/BatchExporter.ts`.
- Cloudflare Workers - `hono-server` is configured for Wrangler with `main: "src/index.ts"` and `compatibility_date: "2026-06-03"` in `hono-server/wrangler.jsonc`.
- npm - Lockfiles are present for `frontend/package-lock.json`, `sdk/nodejs/package-lock.json`, and `carno.js/package-lock.json`.
- Bun - Bun lockfiles are present for `carno.js/bun.lock` and `hono-server/bun.lock`; `carno.js/package.json` scripts use `bun run`.
- Lockfile: present in each package directory except there is no root package lock or root workspace manifest.
## Frameworks
- `@carno.js/core` ^1.5.0 - Decorator-based backend framework used by the active local backend in `carno.js/src/index.ts` and `carno.js/src/routes/LogController.ts`.
- Hono ^4.12.23 - Cloudflare/edge-oriented HTTP framework used by `hono-server/src/index.ts`.
- React ^19.1.0 and React DOM ^19.1.0 - Frontend UI framework used by `frontend/src/main.tsx` and `frontend/src/ui/App.tsx`.
- Vite ^6.3.5 - Frontend dev/build tool configured in `frontend/vite.config.ts`.
- Not detected - No Jest, Vitest, Playwright, Cypress, or test script exists in the package manifests. `sdk/nodejs/package.json` has a placeholder `test` script that exits with an error.
- TypeScript - `frontend/package.json` builds with `tsc -b && vite build`; `sdk/nodejs/package.json` builds with `tsc`; `carno.js/package.json` declares TypeScript as a peer dependency.
- Wrangler ^4.4.0 - Hono server dev/deploy CLI in `hono-server/package.json`; `wrangler dev` and `wrangler deploy --minify` are the package scripts.
- `@vitejs/plugin-react` ^4.5.2 - React plugin configured in `frontend/vite.config.ts`.
- Fallow ^2.88.1 - Static audit/repair tooling exposed through `hono-server/package.json` scripts.
## Key Dependencies
- `@clickhouse/client` ^1.18.5 - Node/Bun ClickHouse client used by the active backend in `carno.js/src/infra/ClickHouseService.ts`.
- `@clickhouse/client-web` ^1.19.0 - Web/Workers-compatible ClickHouse client used by the Hono package in `hono-server/src/infra/db/clickhouse/clickhouse.ts`.
- `@tanstack/react-query` ^5.80.6 - Frontend server-state cache configured in `frontend/src/main.tsx` and used by `frontend/src/ui/App.tsx`.
- `@xyflow/react` ^12.11.0 - Graph/canvas dependency declared in `frontend/package.json`; use for graph visualization work when present in frontend code.
- `uuid` ^14.0.0 - SDK trace/event id generation in `sdk/nodejs/src/Span.ts` and `sdk/nodejs/src/Tracer.ts`.
- `tslog` ^4.10.2 - Structured logger for the Hono package in `hono-server/src/common/logger.ts` and service implementations under `hono-server/src/services/`.
- `@tanstack/react-router` ^1.120.15 - Declared in `frontend/package.json`; no router setup is detected in `frontend/src/main.tsx`.
- `@types/node` ^25.9.1 and `ts-node` ^10.9.2 - SDK development/build dependencies in `sdk/nodejs/package.json`.
- `@types/bun` latest - Bun backend type support in `carno.js/package.json`.
## Configuration
- Active backend `carno.js` reads configuration directly from `process.env` in `carno.js/src/index.ts`, `carno.js/src/infra/ClickHouseService.ts`, `carno.js/src/infra/events/InMemoryEventBus.ts`, and `carno.js/src/services/log/worker/TraceReadModelWorker.ts`.
- Frontend reads `VITE_API_BASE_URL` from `import.meta.env` in `frontend/src/api.ts`, defaulting to `http://localhost:3999`.
- SDK examples and mock seed script read `TOPO_TRACER_URL` from `process.env` in `sdk/nodejs/example/_helpers.ts` and `carno.js/scripts/generate-mock.ts`.
- Hono package centralizes runtime env access through `hono/adapter` in `hono-server/src/common/env.ts`; use this helper instead of direct `process.env` in Hono code.
- No `.env` files detected in the repository scan.
- `carno.js/tsconfig.json` targets `ESNext`, preserves modules, uses bundler resolution, enables decorators, and sets `noEmit: true`.
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`, and `frontend/vite.config.ts` control the Vite/React frontend build.
- `sdk/nodejs/tsconfig.json` emits CommonJS to `sdk/nodejs/dist` with declarations and source maps.
- `hono-server/tsconfig.json` targets `ESNext`, uses bundler resolution, and configures `jsxImportSource: "hono/jsx"`.
- `hono-server/wrangler.jsonc` configures Cloudflare Workers entrypoint and compatibility date.
## Platform Requirements
- Run ClickHouse locally at `http://localhost:8123`; documented in `docs/DEVELOPMENT_AND_VERIFICATION.md`.
- Run active backend from `carno.js` with `bun run dev`; default port is `3999` in `carno.js/src/index.ts`.
- Run frontend from `frontend` with `npm run dev`; default port is `5173` in `frontend/vite.config.ts`.
- Run SDK examples with Bun from `sdk/nodejs/example`; examples call the backend via `TOPO_TRACER_URL` in `sdk/nodejs/example/_helpers.ts`.
- Use `npm run build` in `frontend`, `npm run build` in `sdk/nodejs`, and `bun run check` in `carno.js` for build checks documented in `docs/DEVELOPMENT_AND_VERIFICATION.md`.
- `hono-server` is the package configured for Cloudflare Workers deployment through Wrangler in `hono-server/package.json` and `hono-server/wrangler.jsonc`.
- `carno.js` is the active local telemetry backend with ClickHouse migrations and routes in `carno.js/src/infra/ClickHouseService.ts` and `carno.js/src/routes/LogController.ts`.
- No root deployment manifest, CI workflow, container runtime config, or production frontend hosting config is detected.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Use PascalCase for class, controller, service, React component, and repository files: `frontend/src/ui/App.tsx`, `carno.js/src/routes/LogController.ts`, `carno.js/src/services/log/LogService.ts`, `sdk/nodejs/src/BatchExporter.ts`.
- Use interface-prefixed filenames for abstract service/repository contracts in `hono-server`: `hono-server/src/services/log/api/ILogService.ts`, `hono-server/src/infra/event-bus/api/IEventBus.ts`, `hono-server/src/services/auth/internal/repo/IAuthRepo.ts`.
- Use lowercase utility and barrel filenames for package entry points and shared helpers: `frontend/src/api.ts`, `frontend/src/types.ts`, `hono-server/src/common/logger.ts`, `hono-server/src/services/log/index.ts`, `sdk/nodejs/src/index.ts`.
- Use kebab-case only for generated or legacy package/config directories where already present: `hono-server`, `carno.js`, `sdk/nodejs`.
- Use camelCase for functions and methods: `fetchGraph` in `frontend/src/api.ts`, `ingestEvents` in `carno.js/src/services/log/LogService.ts`, `createCarrierHeaders` in `sdk/nodejs/src/Span.ts`.
- Use verb-first method names for operations: `append`, `listTraces`, `getTraceSummary`, `processBatch`, `flush`, `shutdown`.
- Use private helper functions below the owning class/module for local transformations: `validateEvents`, `clampLimit`, `encodeCursor`, and `decodeCursor` in `carno.js/src/services/log/LogService.ts`; `parseJson` in `carno.js/src/services/log/RawEventRepository.ts`.
- Use static methods for SDK-facing `Tracer` APIs in `sdk/nodejs/src/Tracer.ts`; keep SDK consumer entry points on `Tracer` instead of exposing exporter internals.
- Use camelCase for local variables, parameters, and object fields in TypeScript source: `activeTraceId`, `maxImportance`, `selectedItem` in `frontend/src/ui/App.tsx`; `receivedAtUnixMs` and `traceIds` in `carno.js/src/services/log/RawEventRepository.ts`.
- Use UPPER_SNAKE_CASE for module constants: `API_BASE_URL` and `REQUEST_TIMEOUT_MS` in `frontend/src/api.ts`; `DEFAULT_LIMIT` and `MAX_LIMIT` in `carno.js/src/services/log/LogService.ts`.
- Use snake_case only for database row projections and ClickHouse column names: `trace_id`, `event_id`, `occurred_at_ms` in `carno.js/src/services/log/RawEventRepository.ts`.
- Use explicit nullable state names for React state values that may be absent: `cursor: string | null`, `selectedItem: Inspectable | null`, and `activeTraceId` in `frontend/src/ui/App.tsx`.
- Use PascalCase for exported types and interfaces: `TraceEventInput`, `GraphWindowResponse`, `TraceSummary`, `RawEventStore` in `carno.js/src/services/log/types.ts` and `carno.js/src/services/log/contracts.ts`.
- Use discriminated unions for route or finite UI state where practical: `AppRoute` in `frontend/src/ui/App.tsx`.
- Use abstract classes with `I` prefix in `hono-server` service/repository boundaries: `ILogService`, `ILogWriteRepo`, `IEventBus`, and `IAuthService`.
- Use type-only imports for pure TypeScript shapes: `import type { GraphWindowResponse } from "../types"` in `frontend/src/ui/App.tsx`, `import type { IEventBus }` in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
## Code Style
- No Prettier, Biome, or ESLint configuration is detected in the repo root or package directories.
- Follow the existing two-space indentation, semicolon-terminated TypeScript style used in `frontend/src/api.ts`, `hono-server/src/index.ts`, `sdk/nodejs/src/Tracer.ts`, and `carno.js/src/services/log/LogService.ts`.
- Use double quotes for string literals in TypeScript source.
- Prefer trailing commas in multiline object literals, arrays, imports, function calls, and constructor parameter lists, as shown in `frontend/src/ui/App.tsx` and `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
- Keep short guard clauses single-line when already clear: `if (!summary) return null;` in `carno.js/src/services/log/LogService.ts`, `if (this.isFinished) return;` in `sdk/nodejs/src/Span.ts`.
- No lint runner is configured for `frontend`, `carno.js`, or `sdk/nodejs`.
- `hono-server/package.json` provides `fallow`, `fallow:full`, `fallow:health`, and `fallow:fix` scripts for codebase audit/health, backed by `.fallow/` cache files.
- TypeScript strict mode is enabled in all package tsconfigs: `frontend/tsconfig.app.json`, `hono-server/tsconfig.json`, `sdk/nodejs/tsconfig.json`, and `carno.js/tsconfig.json`.
- `carno.js/tsconfig.json` additionally enables `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, and `noImplicitOverride`; preserve these stricter checks when adding code under `carno.js/src`.
## Import Organization
- No TypeScript path aliases are configured in `frontend/tsconfig.app.json`, `hono-server/tsconfig.json`, `sdk/nodejs/tsconfig.json`, or `carno.js/tsconfig.json`.
- Use relative imports within each package. Do not introduce `@/` or package-local aliases unless the relevant tsconfig and build tools are updated together.
- Keep package boundaries separate: `frontend/src` imports frontend-local `../api` and `../types`; `sdk/nodejs/src` imports from sibling SDK modules; `carno.js/src` imports from `carno.js/src` and external services.
## Error Handling
- Validate API input at service boundaries and throw `Error` with specific messages for invalid requests, as in `validateEvents` in `carno.js/src/services/log/LogService.ts`.
- Return `null` for not-found graph/summary reads instead of throwing, as in `getTraceSummary` and `getGraph` in `carno.js/src/services/log/LogService.ts` and `fetchTraceSummary`/`fetchGraph` in `frontend/src/api.ts`.
- Use `try/catch` around orchestrated service operations that must be logged before rethrowing, as in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` and `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`.
- For lossy background SDK operations, catch and warn rather than throw into user code: `sdk/nodejs/src/BatchExporter.ts` requeues failed batches until retry budget is exhausted.
- Convert malformed JSON or invalid cursor input into safe defaults where the data is auxiliary: `parseJson` in `carno.js/src/services/log/RawEventRepository.ts` returns `{}` and `decodeCursor` in `carno.js/src/services/log/LogService.ts` returns `null`.
## Logging
- In `hono-server`, derive component loggers from `rootLogger` using `getSubLogger({ name })`, as in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` and `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`.
- Use structured metadata for operational logs where possible: `LogServiceImpl.ingestNodesNEdges` logs counts and `userId` in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
- Use scoped console prefixes for background workers and SDK exporter failures: `[TraceReadModelWorker]` in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`, `[TopoTracer]` in `sdk/nodejs/src/BatchExporter.ts`.
- Avoid logging secrets or full credential-bearing payloads. `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts` currently logs serialized signup/auth input; new auth code should prefer redacted fields.
## Comments
- Use comments to explain domain invariants or ordering/idempotency constraints, as in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
- Use comments for non-obvious operational tradeoffs, such as bounded rebuild parallelism in `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts`.
- Avoid comments that restate method names or simple statements.
- JSDoc/TSDoc is not used consistently in current source files.
- Prefer self-describing types and exported type names over adding docblocks for routine functions.
- Add TSDoc only for new public SDK APIs in `sdk/nodejs/src` when the call contract is not obvious from the type signature.
## Function Design
## Module Design
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Nodes and edges are immutable lifecycle events at ingestion time; graph relationships come only from explicit edge events emitted by `sdk/nodejs/src/Tracer.ts` and `sdk/nodejs/src/Span.ts`.
- The write path is append-only in `carno.js/src/services/log/RawEventRepository.ts`; reads use rebuildable `ReplacingMergeTree` projections created by `carno.js/src/services/log/TraceReadModelBuilder.ts`.
- Backend application logic is split into controller, service, repositories, projector, worker, and infrastructure ports under `carno.js/src`.
- Frontend state is server-cache driven with React Query in `frontend/src/ui/App.tsx`; graph layout is a client-side projection over backend `GraphWindowResponse`.
- `hono-server/src` follows a separate service API/internal/repo/impl convention, but `hono-server/src/index.ts` only registers ClickHouse middleware and `GET /`.
## Layers
- Purpose: Provide instrumentation primitives to application code.
- Location: `sdk/nodejs/src`
- Contains: `Tracer`, `TraceNode`/`Span`, `BatchExporter`, event types, importance normalization.
- Depends on: `uuid`, global `fetch`, Node timers.
- Used by: Example trace scripts in `sdk/nodejs/example` and any instrumented Node app.
- Purpose: Expose telemetry ingestion and graph read endpoints.
- Location: `carno.js/src/routes`
- Contains: Controller decorators and query/body parameter mapping.
- Depends on: `LogService`, `TraceReadModelWorker`, `@carno.js/core`.
- Used by: SDK `BatchExporter` and frontend `frontend/src/api.ts`.
- Purpose: Own input validation, query clamping, pagination cursor encoding, and orchestration between repositories and domain events.
- Location: `carno.js/src/services/log/LogService.ts`
- Contains: `ingestEvents`, `listTraces`, `getTraceSummary`, `getGraph`, validation helpers.
- Depends on: `RawEventRepository`, `ReadModelRepository`, `EventBus`.
- Used by: `carno.js/src/routes/LogController.ts`.
- Purpose: Isolate ClickHouse writes, replay queries, materialized read writes, summary reads, and graph projection queries.
- Location: `carno.js/src/services/log/RawEventRepository.ts`, `carno.js/src/services/log/ReadModelRepository.ts`, `carno.js/src/infra/ClickHouseService.ts`
- Contains: Table migrations, insert calls, query mappers, projection helpers.
- Depends on: `@clickhouse/client`.
- Used by: `LogService` and `TraceReadModelWorker`.
- Purpose: Convert raw events into a read model after ingestion.
- Location: `carno.js/src/services/log/TraceReadModelBuilder.ts`, `carno.js/src/services/log/worker/TraceReadModelWorker.ts`
- Contains: Event replay, lifecycle finalization, diagnostics, topological ordering, dirty-trace queue, recovery scan.
- Depends on: `EventBus`, raw/read repositories.
- Used by: Application lifecycle hooks and manual `POST /telemetry/materialize`.
- Purpose: Provide database and event bus adapters.
- Location: `carno.js/src/infra`
- Contains: ClickHouse client/migrations and in-memory event bus implementation.
- Depends on: `@clickhouse/client`, `@carno.js/core`.
- Used by: Bootstrap and services.
- Purpose: Render a trace-list, graph canvas, and inspector from backend graph windows.
- Location: `frontend/src`
- Contains: API client, React entry point, React Flow workspace, shared frontend types, CSS.
- Depends on: React, React Query, React Flow, Vite.
- Used by: Browser clients.
- Purpose: Cloudflare Worker-oriented backend scaffold using Hono, explicit API/internal service boundaries, and ClickHouse Web client middleware.
- Location: `hono-server/src`
- Contains: `common`, `infra`, `services/auth`, `services/log`.
- Depends on: Hono, `@clickhouse/client-web`, Wrangler.
- Used by: `hono-server/src/index.ts`; telemetry routes are not mounted in the current entry point.
## Data Flow
### Primary Request Path
### Graph Read Flow
- Backend durable state lives in ClickHouse tables created by `carno.js/src/infra/ClickHouseService.ts`.
- Backend process state is limited to DI singletons, the in-memory event bus idempotency map, and the materializer worker's timers/queue in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`.
- Frontend UI state is local React state in `frontend/src/ui/App.tsx`; server data cache is React Query from `frontend/src/main.tsx`.
- SDK state is a static `BatchExporter` singleton on `Tracer` in `sdk/nodejs/src/Tracer.ts`.
## Key Abstractions
- Purpose: Immutable write-side facts for node and edge lifecycle transitions.
- Examples: `sdk/nodejs/src/types.ts`, `carno.js/src/services/log/types.ts`, `carno.js/src/services/log/RawEventRepository.ts`
- Pattern: Append-only event stream with stable event ids and retry collapse during replay.
- Purpose: Represent causal links between nodes; no parent id or implicit nesting exists.
- Examples: `sdk/nodejs/src/Tracer.ts`, `sdk/nodejs/src/Span.ts`, `docs/TRACE_DESIGN.md`
- Pattern: Edge lifecycle events are separate entities with `fromNodeId`, `toNodeId`, and `label`.
- Purpose: Rebuild a trace's latest read nodes, read edges, and summary from raw events.
- Examples: `carno.js/src/services/log/contracts.ts`, `carno.js/src/services/log/TraceReadModelBuilder.ts`
- Pattern: Pure-ish projector class plus repository save; builder keeps only monotonic materialization timestamp state.
- Purpose: Convert materialized nodes/edges into a frontend window that respects importance filtering.
- Examples: `carno.js/src/services/log/ReadModelRepository.ts`, `frontend/src/types.ts`
- Pattern: Backend creates ghost nodes/edges for hidden detail; frontend renders returned nodes/edges directly.
- Purpose: Decouple services from event bus and repository contracts.
- Examples: `carno.js/src/infra/events/EventBus.ts`, `carno.js/src/services/log/contracts.ts`, `hono-server/src/infra/event-bus/api/IEventBus.ts`
- Pattern: Abstract class or TypeScript interface contract with concrete in-memory/development implementation.
## Entry Points
- Location: `carno.js/src/index.ts`
- Triggers: `bun run dev`, `bun run src/index.ts`, or equivalent Bun execution.
- Responsibilities: Configure CORS/validation, register services/controllers, initialize ClickHouse, start materializer worker, listen on `PORT` or `3999`.
- Location: `carno.js/src/routes/LogController.ts`
- Triggers: HTTP requests under `/telemetry`.
- Responsibilities: Map request bodies/path/query params to `LogService` calls and expose manual materialization.
- Location: `frontend/src/main.tsx`
- Triggers: Vite-served browser load.
- Responsibilities: Create React root, install React Query provider, render `App`.
- Location: `sdk/nodejs/src/index.ts`
- Triggers: Consumer imports.
- Responsibilities: Re-export public tracing types and classes from `types`, `Span`, and `Tracer`.
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
### Serving Raw Events Directly To The UI
### Adding Mounted Logic Only Under `hono-server/src/services`
## Error Handling
- Validate telemetry batches before persistence in `carno.js/src/services/log/LogService.ts`.
- Treat malformed JSON data as `{}` during replay/read mapping in `carno.js/src/services/log/RawEventRepository.ts` and `carno.js/src/services/log/ReadModelRepository.ts`.
- Record data-quality issues as diagnostics such as `missingStart`, `missingEnd`, `negativeDuration`, `cycleDetected`, `orphanEdge`, and `clockSkewSuspected` in `carno.js/src/services/log/TraceReadModelBuilder.ts`.
- Catch and log async event handler failures in `carno.js/src/infra/events/InMemoryEventBus.ts`.
- Requeue SDK batches on transient flush failure until `maxRetries` is exceeded in `sdk/nodejs/src/BatchExporter.ts`.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

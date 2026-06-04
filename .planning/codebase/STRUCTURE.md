# Codebase Structure

**Analysis Date:** 2026-06-04

## Directory Layout

```text
Topo-Tracer/
├── carno.js/                 # Active Bun/Carno telemetry API and materializer
│   ├── scripts/              # Seed/mock data scripts
│   └── src/
│       ├── index.ts          # Carno app bootstrap
│       ├── infra/            # ClickHouse and event bus adapters
│       ├── routes/           # HTTP controllers
│       └── services/log/     # Trace event, read model, projection, and worker logic
├── frontend/                 # Vite React graph workspace
│   └── src/
│       ├── main.tsx          # React entry point
│       ├── api.ts            # Backend fetch client
│       ├── types.ts          # Frontend graph/read API types
│       ├── styles.css        # Workspace styling
│       └── ui/               # React UI components
├── hono-server/              # Cloudflare Worker/Hono backend scaffold
│   └── src/
│       ├── common/           # Env, logging, timestamp, exception helpers
│       ├── infra/            # DB and event bus adapters
│       └── services/         # Auth and log service modules
├── sdk/nodejs/               # Node tracing SDK package and examples
│   ├── src/                  # SDK source
│   └── example/              # Instrumentation examples
├── docs/                     # Product and architecture reference docs
├── .planning/codebase/       # Generated GSD codebase maps
├── docker-compose.yml        # Local infrastructure
└── .gitignore                # Repo ignore rules
```

## Directory Purposes

**`carno.js`:**
- Purpose: Active backend API for telemetry ingestion, ClickHouse persistence, read-model materialization, and graph reads.
- Contains: Bun package metadata, ClickHouse migration service, Carno controller, log service, repositories, event bus, worker, seed script.
- Key files: `carno.js/src/index.ts`, `carno.js/src/routes/LogController.ts`, `carno.js/src/infra/ClickHouseService.ts`, `carno.js/src/services/log/LogService.ts`, `carno.js/src/services/log/ReadModelRepository.ts`

**`carno.js/src/infra`:**
- Purpose: Backend infrastructure adapters registered with Carno DI.
- Contains: `ClickHouseService` plus event bus contract and in-memory adapter.
- Key files: `carno.js/src/infra/ClickHouseService.ts`, `carno.js/src/infra/events/EventBus.ts`, `carno.js/src/infra/events/InMemoryEventBus.ts`

**`carno.js/src/routes`:**
- Purpose: HTTP-facing controller layer.
- Contains: Decorated Carno controllers only.
- Key files: `carno.js/src/routes/LogController.ts`

**`carno.js/src/services/log`:**
- Purpose: Trace write/read application module.
- Contains: API-facing service, repositories, projector contracts, trace types, read model builder, background worker.
- Key files: `carno.js/src/services/log/LogService.ts`, `carno.js/src/services/log/contracts.ts`, `carno.js/src/services/log/types.ts`, `carno.js/src/services/log/RawEventRepository.ts`, `carno.js/src/services/log/ReadModelRepository.ts`, `carno.js/src/services/log/TraceReadModelBuilder.ts`, `carno.js/src/services/log/worker/TraceReadModelWorker.ts`

**`frontend`:**
- Purpose: Browser UI for listing traces, viewing a graph, filtering by importance, paging graph windows, and inspecting selected nodes/edges.
- Contains: Vite config, TypeScript config, React entry point, API client, types, CSS, and UI component file.
- Key files: `frontend/src/main.tsx`, `frontend/src/api.ts`, `frontend/src/ui/App.tsx`, `frontend/src/types.ts`, `frontend/src/styles.css`

**`sdk/nodejs`:**
- Purpose: Consumer-facing Node SDK for emitting topology trace events.
- Contains: Public exports, tracer singleton, trace node/span class, batch exporter, importance helper, SDK types, and example scripts.
- Key files: `sdk/nodejs/src/index.ts`, `sdk/nodejs/src/Tracer.ts`, `sdk/nodejs/src/Span.ts`, `sdk/nodejs/src/BatchExporter.ts`, `sdk/nodejs/src/types.ts`, `sdk/nodejs/example/basic_usage.ts`

**`hono-server`:**
- Purpose: Cloudflare Worker-oriented backend scaffold with Hono, service API/internal boundaries, ClickHouse Web client, auth contracts, and a log write path.
- Contains: Wrangler config, Hono app entry, common utilities, infra adapters, auth service, log service.
- Key files: `hono-server/src/index.ts`, `hono-server/src/common/env.ts`, `hono-server/src/infra/db/clickhouse/clickhouse.ts`, `hono-server/src/services/auth/index.ts`, `hono-server/src/services/log/index.ts`

**`docs`:**
- Purpose: Human reference for trace design, backend schema, code-level flow, development commands, and verification.
- Contains: Markdown architecture/design documents.
- Key files: `docs/README.md`, `docs/TRACE_DESIGN.md`, `docs/TRACE_FLOW_CODE_LEVEL.md`, `docs/BACKEND_SCHEMA_AND_QUERIES.md`, `docs/DEVELOPMENT_AND_VERIFICATION.md`

## Key File Locations

**Entry Points:**
- `carno.js/src/index.ts`: Active backend server bootstrap.
- `frontend/src/main.tsx`: React/Vite app bootstrap.
- `sdk/nodejs/src/index.ts`: SDK public export surface.
- `hono-server/src/index.ts`: Hono/Cloudflare Worker app bootstrap.

**Configuration:**
- `carno.js/package.json`: Bun scripts for active API development, seeding, and build check.
- `carno.js/tsconfig.json`: TypeScript settings for active API.
- `frontend/package.json`: Vite build/dev scripts and React dependencies.
- `frontend/vite.config.ts`: Vite configuration.
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`: Frontend TypeScript projects.
- `sdk/nodejs/package.json`: SDK build script and package metadata.
- `sdk/nodejs/tsconfig.json`: SDK TypeScript configuration.
- `hono-server/package.json`: Wrangler and Hono scripts.
- `hono-server/wrangler.jsonc`: Cloudflare Worker configuration.
- `docker-compose.yml`: Local ClickHouse and supporting infrastructure.

**Core Logic:**
- `sdk/nodejs/src/Tracer.ts`: Trace lifecycle API and edge event emission.
- `sdk/nodejs/src/Span.ts`: `TraceNode`/`Span` object model and node event emission.
- `sdk/nodejs/src/BatchExporter.ts`: Batching, retry, and HTTP export.
- `carno.js/src/services/log/LogService.ts`: Backend orchestration for writes and reads.
- `carno.js/src/services/log/RawEventRepository.ts`: Raw event append and replay.
- `carno.js/src/services/log/TraceReadModelBuilder.ts`: Event replay and read model construction.
- `carno.js/src/services/log/ReadModelRepository.ts`: Read-model persistence and graph projection.
- `carno.js/src/services/log/worker/TraceReadModelWorker.ts`: Event-driven and recovery materialization.
- `frontend/src/ui/App.tsx`: Main UI, routing state, data queries, graph rendering, layout helpers.

**Testing:**
- `sdk/nodejs/package.json`: Contains a placeholder `test` script only.
- No `*.test.*` or `*.spec.*` files are present in the full repo scan.
- Verification guidance lives in `docs/DEVELOPMENT_AND_VERIFICATION.md`.

## Naming Conventions

**Files:**
- PascalCase class/service files in active backend and SDK: `carno.js/src/services/log/LogService.ts`, `carno.js/src/services/log/TraceReadModelBuilder.ts`, `sdk/nodejs/src/BatchExporter.ts`.
- Lowercase infrastructure barrel/index files: `hono-server/src/infra/db/index.ts`, `hono-server/src/services/log/index.ts`, `carno.js/src/services/log/types.ts`.
- Interface/abstract contracts use `I` prefix in Hono scaffold: `hono-server/src/services/log/api/ILogService.ts`, `hono-server/src/services/auth/internal/repo/IAuthRepo.ts`.
- Frontend component file uses PascalCase: `frontend/src/ui/App.tsx`.
- Markdown docs use uppercase topic names in `docs`: `docs/TRACE_DESIGN.md`, `docs/BACKEND_SCHEMA_AND_QUERIES.md`.

**Directories:**
- Active backend uses feature folders under `carno.js/src/services`, with nested `worker` for background processing.
- Hono scaffold uses `api`, `internal`, `repo`, `repo/impl`, and `service-impl` subdirectories under each service, for example `hono-server/src/services/log/internal/repo/impl`.
- Frontend UI code lives under `frontend/src/ui`; shared fetch/types/styles live directly under `frontend/src`.
- SDK examples live under `sdk/nodejs/example`; source lives under `sdk/nodejs/src`.

## Where to Add New Code

**New Active Telemetry Endpoint:**
- Primary code: `carno.js/src/routes/LogController.ts` for route mapping and `carno.js/src/services/log/LogService.ts` for application logic.
- Persistence/query support: `carno.js/src/services/log/RawEventRepository.ts` or `carno.js/src/services/log/ReadModelRepository.ts`.
- Types/contracts: `carno.js/src/services/log/types.ts` and `carno.js/src/services/log/contracts.ts`.
- Tests: Not established; add a focused test structure alongside the package that owns the code when a test runner is introduced.

**New Graph Projection Behavior:**
- Primary code: `carno.js/src/services/log/ReadModelRepository.ts`.
- Projector support: `carno.js/src/services/log/TraceReadModelBuilder.ts` if the behavior depends on replayed lifecycle state.
- Frontend consumption: `frontend/src/types.ts`, `frontend/src/api.ts`, and `frontend/src/ui/App.tsx`.

**New SDK Instrumentation Capability:**
- Public API: `sdk/nodejs/src/Tracer.ts` or `sdk/nodejs/src/Span.ts`.
- Shared types: `sdk/nodejs/src/types.ts`.
- Export surface: `sdk/nodejs/src/index.ts`.
- Examples: Add scenario files under `sdk/nodejs/example`.

**New Frontend View or Component:**
- Primary code: `frontend/src/ui`.
- Shared API calls: `frontend/src/api.ts`.
- Shared response/view types: `frontend/src/types.ts`.
- Styling: `frontend/src/styles.css`.

**New Active Backend Infrastructure Adapter:**
- Implementation: `carno.js/src/infra`.
- Registration: `carno.js/src/index.ts`.
- Service dependency contracts: `carno.js/src/services/log/contracts.ts` or an adjacent service-local contract file.

**New Hono/Cloudflare Feature:**
- Route mounting: `hono-server/src/index.ts`.
- Service public contract: `hono-server/src/services/<feature>/api`.
- Service implementation: `hono-server/src/services/<feature>/internal/service-impl`.
- Repository contract: `hono-server/src/services/<feature>/internal/repo`.
- Repository implementation: `hono-server/src/services/<feature>/internal/repo/impl`.
- Shared infra: `hono-server/src/infra`.

**Utilities:**
- Active backend shared helpers: add only cross-feature helpers under `carno.js/src/infra` or a new `carno.js/src/common` if they are not log-specific.
- Hono shared helpers: `hono-server/src/common`.
- Frontend helpers: keep UI-specific helpers near `frontend/src/ui/App.tsx` until reused; shared fetch/types belong in `frontend/src/api.ts` and `frontend/src/types.ts`.

## Special Directories

**`carno.js/node_modules`, `frontend/node_modules`, `hono-server/node_modules`, `sdk/nodejs/node_modules`:**
- Purpose: Installed package dependencies.
- Generated: Yes.
- Committed: No.

**`frontend/dist`:**
- Purpose: Vite production build output.
- Generated: Yes.
- Committed: No.

**`sdk/nodejs/dist`:**
- Purpose: TypeScript build output for the SDK package.
- Generated: Yes.
- Committed: No.

**`hono-server/.wrangler`:**
- Purpose: Wrangler local/dev generated files.
- Generated: Yes.
- Committed: No.

**`hono-server/.fallow`:**
- Purpose: Fallow audit/cache output.
- Generated: Yes.
- Committed: No.

**`.planning/codebase`:**
- Purpose: GSD-generated codebase maps for planning/execution agents.
- Generated: Yes.
- Committed: Project-dependent; files in this directory are written by mapping commands.

---

*Structure analysis: 2026-06-04*

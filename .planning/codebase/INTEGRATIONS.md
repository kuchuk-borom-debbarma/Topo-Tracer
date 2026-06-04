# External Integrations

**Analysis Date:** 2026-06-04

## APIs & External Services

**Telemetry HTTP API:**
- Topo Tracer backend API - Receives SDK events and serves trace list/summary/graph data.
  - SDK/Client: Browser `fetch` in `frontend/src/api.ts`, SDK `fetch` in `sdk/nodejs/src/BatchExporter.ts`, seed `fetch` in `carno.js/scripts/generate-mock.ts`.
  - Auth: Not detected for active `carno.js` endpoints; routes in `carno.js/src/routes/LogController.ts` do not require a token.
  - Endpoints: `POST /telemetry/events`, `GET /telemetry/traces`, `GET /telemetry/traces/:traceId/summary`, `GET /telemetry/traces/:traceId/graph`, `POST /telemetry/materialize` in `carno.js/src/routes/LogController.ts`.
  - Base URL env: `VITE_API_BASE_URL` in `frontend/src/api.ts`; `TOPO_TRACER_URL` in `sdk/nodejs/example/_helpers.ts` and `carno.js/scripts/generate-mock.ts`.

**Cloudflare Workers Runtime:**
- Cloudflare Workers - Deployment/runtime target for `hono-server`.
  - SDK/Client: `wrangler` ^4.4.0 from `hono-server/package.json`.
  - Auth: Cloudflare deployment credentials are external to the repository; no checked-in credentials detected.
  - Config: `hono-server/wrangler.jsonc` with `main: "src/index.ts"` and compatibility date `2026-06-03`.

**Notification Service:**
- Not implemented - `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts` contains a TODO to publish a notification during signup, but there is no notification client or provider package.
  - SDK/Client: Not detected.
  - Auth: Not detected.

## Data Storage

**Databases:**
- ClickHouse - Primary telemetry event and read-model store.
  - Connection: `CLICKHOUSE_HOST`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` for `carno.js/src/infra/ClickHouseService.ts`; `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE` for `hono-server/src/infra/db/clickhouse/clickhouse.ts`.
  - Client: `@clickhouse/client` in `carno.js/src/infra/ClickHouseService.ts`; `@clickhouse/client-web` in `hono-server/src/infra/db/clickhouse/clickhouse.ts`.
  - Active tables: `topo_tracer.node_trace_events`, `topo_tracer.node_read_nodes`, `topo_tracer.node_read_edges`, `topo_tracer.node_trace_summary` created by `carno.js/src/infra/ClickHouseService.ts`.
  - Hono tables: `node_events` and `edge_events` defined in `hono-server/src/infra/db/clickhouse/schema.ts`.
- PostgreSQL - Stubbed auth repository surface only.
  - Connection: Not detected; `hono-server/src/infra/db/postgres.ts` is empty and `hono-server/package.json` has no PostgreSQL driver.
  - Client: Not implemented; `hono-server/src/services/auth/internal/repo/impl/AuthRepoPg.ts` methods throw `Method not implemented`.

**File Storage:**
- Local filesystem only - No S3, R2, GCS, Azure Blob, or local upload implementation detected. `hono-server/wrangler.jsonc` contains commented R2 example config only.

**Caching:**
- Frontend in-memory query cache - `@tanstack/react-query` `QueryClient` configured in `frontend/src/main.tsx`.
- Backend process memory - `InMemoryEventBus` handles local event publishing/deduplication in `carno.js/src/infra/events/InMemoryEventBus.ts`.
- External cache: None detected.

## Authentication & Identity

**Auth Provider:**
- Active telemetry backend: No authentication provider detected.
  - Implementation: `carno.js/src/routes/LogController.ts` exposes telemetry routes without auth guards.
- Hono auth service: Custom, incomplete auth surface.
  - Implementation: `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts` defines signup and token flows against `IAuthRepo`.
  - Auth secret: `JWT_SECRET` is typed in `hono-server/src/common/env.ts`, but `hono-server/src/services/auth/internal/util/jwt.ts` is empty and `getAuthToken` returns an empty string.
  - OTP: Development-only hardcoded OTP `"12345"` appears in `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`.

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, OpenTelemetry exporter, Datadog, Honeycomb, or equivalent package exists in any package manifest.

**Logs:**
- `carno.js` backend uses framework/server console behavior and explicit console logging in scripts/workers; `carno.js/scripts/generate-mock.ts` prints seed status and errors.
- SDK logs exporter failures with `console.error` and `console.warn` in `sdk/nodejs/src/BatchExporter.ts`.
- Hono package uses `tslog` root logger from `hono-server/src/common/logger.ts`; services and repositories create sub-loggers in `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`, `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`, and `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts`.

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers - Configured for `hono-server` through `hono-server/wrangler.jsonc`.
- Frontend hosting: Not detected; `frontend/package.json` supports local dev, production build, and preview only.
- Active `carno.js` backend hosting: Not detected; local Bun dev and build-check scripts only.

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, CircleCI, or other CI config found in the scanned repository files.

## Environment Configuration

**Required env vars:**
- `PORT` - Active backend port for `carno.js/src/index.ts`; defaults to `3999`.
- `CLICKHOUSE_HOST` - Active backend ClickHouse URL in `carno.js/src/infra/ClickHouseService.ts`; defaults to `http://localhost:8123`.
- `CLICKHOUSE_USER` - Active backend ClickHouse username in `carno.js/src/infra/ClickHouseService.ts`; defaults to `default`.
- `CLICKHOUSE_PASSWORD` - Active backend ClickHouse password in `carno.js/src/infra/ClickHouseService.ts`; defaults to `password`.
- `EVENT_BUS_IDEMPOTENCY_TTL_MS` - In-memory event bus dedupe TTL in `carno.js/src/infra/events/InMemoryEventBus.ts`; documented default is `600000` in `docs/DEVELOPMENT_AND_VERIFICATION.md`.
- `TRACE_MATERIALIZER_BATCH_SIZE` - Dirty trace batch size in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`; documented default is `50`.
- `TRACE_MATERIALIZER_RECOVERY_INTERVAL_MS` - Materializer recovery scan interval in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`; documented default is `30000`.
- `TRACE_MATERIALIZER_INTERVAL_MS` - Legacy fallback for recovery interval in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`.
- `VITE_API_BASE_URL` - Frontend backend URL in `frontend/src/api.ts`; defaults to `http://localhost:3999`.
- `TOPO_TRACER_URL` - SDK examples and mock seed backend URL in `sdk/nodejs/example/_helpers.ts` and `carno.js/scripts/generate-mock.ts`; defaults to `http://localhost:3999`.
- `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE` - Hono package ClickHouse config in `hono-server/src/infra/db/clickhouse/clickhouse.ts`.
- `JWT_SECRET` - Hono auth config type in `hono-server/src/common/env.ts`; no active JWT implementation detected.

**Secrets location:**
- No `.env` files detected.
- Runtime secrets for `hono-server` should be provided as Cloudflare Worker bindings/secrets read through `hono-server/src/common/env.ts`.
- Runtime secrets for `carno.js` are process environment variables read directly in `carno.js/src/infra/ClickHouseService.ts`.
- `docker-compose.yml` exists at repository root, but its contents were not read or quoted because compose files can contain inline secrets.

## Webhooks & Callbacks

**Incoming:**
- `POST /telemetry/events` - Incoming telemetry event ingestion endpoint in `carno.js/src/routes/LogController.ts`.
- `POST /telemetry/materialize` - Manual materialization trigger in `carno.js/src/routes/LogController.ts`.
- Hono root route `GET /` - Health/demo text route in `hono-server/src/index.ts`.

**Outgoing:**
- Frontend outgoing API calls to telemetry backend in `frontend/src/api.ts`.
- SDK outgoing telemetry batches to `/telemetry/events` in `sdk/nodejs/src/BatchExporter.ts`.
- SDK example and seed outgoing calls to `/telemetry/materialize` in `sdk/nodejs/example/_helpers.ts` and `carno.js/scripts/generate-mock.ts`.
- External outbound webhooks: None detected.

---

*Integration audit: 2026-06-04*

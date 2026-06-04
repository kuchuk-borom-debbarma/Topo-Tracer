# Codebase Concerns

**Analysis Date:** 2026-06-04

## Tech Debt

**Two backend implementations diverge:**
- Issue: `carno.js` is the documented, runnable telemetry backend, while `hono-server` contains a separate Hono/Cloudflare-oriented backend with different table names, payload shapes, service contracts, and incomplete routing.
- Files: `carno.js/src/index.ts`, `carno.js/src/infra/ClickHouseService.ts`, `carno.js/src/services/log/types.ts`, `hono-server/src/index.ts`, `hono-server/src/infra/db/clickhouse/schema.ts`, `hono-server/src/services/log/api/types.ts`, `docs/README.md`
- Impact: Backend work can land in the wrong implementation or duplicate behavior. Schema changes are especially risky because `carno.js` writes `topo_tracer.node_trace_events` and read-model tables, while `hono-server` defines `node_events` and `edge_events`.
- Fix approach: Pick the active backend for new product behavior. Treat `hono-server/src/code-base.md` as migration guidance only until `hono-server/src/index.ts` mounts equivalent telemetry routes and its schema matches the working read/write model.

**Hono server is scaffolded but not feature-complete:**
- Issue: The Hono app only registers ClickHouse middleware and `GET /`; auth, log ingestion, read APIs, and the read-optimized aggregator are not mounted.
- Files: `hono-server/src/index.ts`, `hono-server/src/services/auth/index.ts`, `hono-server/src/services/log/index.ts`, `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts`
- Impact: Deploying `hono-server` produces a server that responds at root but does not expose the product API expected by the SDK/frontend.
- Fix approach: Add route modules that call `hono-server/src/services/log/index.ts` and `hono-server/src/services/auth/index.ts`, translate `TopoTraceException` into HTTP responses, and initialize `ReadOptimisedAggregator` during app startup.

**Generated and local artifact churn is easy to reintroduce:**
- Issue: Ignore rules exclude `dist/`, `node_modules/`, and `*.tsbuildinfo`, but the workspace contains ignored build/dependency directories under `frontend/` and `sdk/nodejs/`. The repo also tracks `.DS_Store`.
- Files: `.gitignore`, `frontend/.gitignore`, `sdk/nodejs/.gitignore`, `.DS_Store`
- Impact: Tooling and searches can accidentally include generated output or OS metadata. Repo hygiene problems make code review noisier and can hide source-vs-build mismatches.
- Fix approach: Keep generated directories ignored and untracked. Remove `.DS_Store` from the index in a cleanup-only change, then verify `git ls-files` stays limited to source, docs, config, and lockfiles.

**Mixed package managers and lockfiles:**
- Issue: `carno.js` has both `package-lock.json` and `bun.lock`; `hono-server` has `bun.lock` but scripts use Wrangler; `frontend` and `sdk/nodejs` use npm lockfiles.
- Files: `carno.js/package.json`, `carno.js/package-lock.json`, `carno.js/bun.lock`, `hono-server/package.json`, `hono-server/bun.lock`, `frontend/package-lock.json`, `sdk/nodejs/package-lock.json`
- Impact: Dependency resolution can differ between developers and CI. The active backend can be installed with Bun or npm and produce different transitive versions.
- Fix approach: Document one package manager per package and remove stale lockfiles only after confirming the chosen install command for that package.

**Large single-file frontend surface:**
- Issue: Application state, routing, trace rail, graph header, React Flow canvas, inspector, layout algorithm, formatting, and rendering helpers all live in one file.
- Files: `frontend/src/ui/App.tsx`
- Impact: Small UI changes risk regressions across routing, graph layout, selection behavior, and inspector rendering. Review and testing are harder because unrelated concerns move together.
- Fix approach: Split by responsibility: keep route/app state in `frontend/src/ui/App.tsx`, move graph rendering/layout into `frontend/src/ui/TraceGraphCanvas.tsx` plus a layout helper, and move `TraceRail` and `Inspector` into their own components.

**Type safety is weakest at database boundaries:**
- Issue: ClickHouse rows are mapped through `any`, and malformed JSON silently becomes `{}`.
- Files: `carno.js/src/services/log/RawEventRepository.ts`, `carno.js/src/services/log/ReadModelRepository.ts`
- Impact: Schema drift and bad payloads can become empty metadata or `NaN` values instead of visible failures. This is risky for graph projection because the frontend trusts numeric fields.
- Fix approach: Define row types for each query, parse with narrow runtime guards, and surface parse/schema errors through diagnostics or logs instead of silently normalizing everything.

## Known Bugs

**Auth repository methods always throw:**
- Symptoms: Any Hono auth flow fails at runtime with `Method not implemented.`
- Files: `hono-server/src/services/auth/internal/repo/impl/AuthRepoPg.ts`, `hono-server/src/services/auth/internal/repo/index.ts`, `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`
- Trigger: Call `authService.startSignUp`, `authService.finishSignUp`, or `authService.getAuthToken` from `hono-server/src/services/auth/index.ts`.
- Workaround: Do not expose Hono auth routes until `AuthRepoPg` is implemented with a real database client and migrations.

**Auth token generation returns an empty string:**
- Symptoms: `getAuthToken` succeeds only if the repository returns a user, then returns `""` instead of a JWT or session token.
- Files: `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`, `hono-server/src/services/auth/internal/util/jwt.ts`, `hono-server/src/common/env.ts`
- Trigger: Call `authService.getAuthToken({ email, password })`.
- Workaround: Treat `hono-server` auth as unavailable. Implement `hono-server/src/services/auth/internal/util/jwt.ts` with `JWT_SECRET` validation before exposing login.

**Read-optimized aggregator drops work:**
- Symptoms: `ReadOptimisedAggregator.run()` accepts `log.trace.ingested` events and validates payloads, but `rebuildTrace()` has no implementation.
- Files: `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts`, `hono-server/src/services/log/internal/repo/ILogReadRepo.ts`, `hono-server/src/services/log/internal/repo/index.ts`
- Trigger: Publish `log.trace.ingested` through `hono-server/src/infra/event-bus/index.ts`.
- Workaround: Use the `carno.js` materializer (`carno.js/src/services/log/worker/TraceReadModelWorker.ts`) for read-model behavior until Hono read-model persistence exists.

**SDK can silently drop events before initialization:**
- Symptoms: Calls to `Tracer.startTrace()` emit a `node.started` event from `TraceNode`, but `Tracer.exportEvent()` is a no-op when `Tracer.init()` has not been called.
- Files: `sdk/nodejs/src/Tracer.ts`, `sdk/nodejs/src/Span.ts`, `sdk/nodejs/example/_helpers.ts`
- Trigger: Use the SDK without calling `Tracer.init({ baseUrl })` first.
- Workaround: Always call `Tracer.init()` before creating spans. Prefer changing `Tracer.exportEvent()` to throw or buffer explicitly when uninitialized.

**SDK shutdown can return before an in-flight flush completes:**
- Symptoms: `BatchExporter.flush()` returns immediately when `isFlushing` is true, so `Tracer.shutdown()` can resolve while a previous flush is still running.
- Files: `sdk/nodejs/src/BatchExporter.ts`, `sdk/nodejs/src/Tracer.ts`
- Trigger: Call `Tracer.shutdown()` while a timer-triggered or batch-triggered flush is active.
- Workaround: Call `Tracer.flush()` before shutdown only when no other flush is active. Prefer tracking the active flush promise and awaiting it from `stop()`.

## Security Considerations

**Telemetry API has no authentication or tenant enforcement:**
- Risk: Anyone who can reach the `carno.js` backend can ingest arbitrary telemetry and read any trace by ID.
- Files: `carno.js/src/index.ts`, `carno.js/src/routes/LogController.ts`, `carno.js/src/services/log/LogService.ts`, `frontend/src/api.ts`, `sdk/nodejs/src/BatchExporter.ts`
- Current mitigation: Not detected. The documented backend is local-development oriented.
- Recommendations: Add authentication middleware, associate trace writes/reads with an owner, and require SDK credentials or signed ingestion tokens before using this beyond local development.

**CORS is fully open in the active backend:**
- Risk: Browser applications from any origin can call the telemetry API.
- Files: `carno.js/src/index.ts`, `docs/DEVELOPMENT_AND_VERIFICATION.md`
- Current mitigation: Documentation labels this as dev CORS.
- Recommendations: Make allowed origins environment-driven and fail closed outside local development.

**Auth service logs raw credentials and OTP tokens:**
- Risk: `AuthServiceImpl` logs full request data for signup, OTP verification, and login, including passwords, OTPs, and tokens.
- Files: `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`, `hono-server/src/code-base.md`
- Current mitigation: `hono-server/src/code-base.md` says not to log passwords, tokens, OTPs, secrets, raw credentials, or raw payloads, but the implementation violates that rule.
- Recommendations: Log only non-sensitive identifiers such as normalized email hash or user id. Never stringify auth request objects.

**Development OTP is hardcoded:**
- Risk: Signup verification accepts a fixed OTP value once repository persistence exists.
- Files: `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`
- Current mitigation: Comment labels the value development-only.
- Recommendations: Generate random OTPs, store only hashed OTP values with expiration and attempt limits, and send through a notification service.

**Default local infrastructure credentials are documented and configured:**
- Risk: Local ClickHouse defaults are suitable for development only and can become unsafe if copied into shared environments.
- Files: `carno.js/src/infra/ClickHouseService.ts`, `docker-compose.yml`, `docs/DEVELOPMENT_AND_VERIFICATION.md`, `hono-server/src/infra/db/clickhouse/clickhouse.ts`
- Current mitigation: Environment variables can override defaults.
- Recommendations: Require explicit ClickHouse credentials for non-local environments and document which defaults are development-only without committing secret values.

## Performance Bottlenecks

**Graph projection loads all nodes and edges before pagination:**
- Problem: `getProjectedGraph()` reads every latest node and edge for a trace, builds hidden projections in memory, then slices the requested window.
- Files: `carno.js/src/services/log/ReadModelRepository.ts`, `carno.js/src/services/log/LogService.ts`, `frontend/src/api.ts`
- Cause: Importance projection and ghost edge aggregation are implemented in TypeScript after broad ClickHouse queries.
- Improvement path: Push visible-node filtering, ordering, and page window selection into ClickHouse, then fetch only edges touching visible or ghost-window endpoints.

**Read model materialization is serial per trace:**
- Problem: `TraceReadModelWorker` processes traces one at a time inside each batch.
- Files: `carno.js/src/services/log/worker/TraceReadModelWorker.ts`, `carno.js/src/services/log/TraceReadModelBuilder.ts`, `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts`
- Cause: Serial processing avoids storage overload but caps recovery throughput.
- Improvement path: Add bounded concurrency keyed by trace id, keep per-trace ordering, and make rebuild writes idempotent before parallelizing.

**App startup runs ClickHouse migrations inline:**
- Problem: `ClickHouseService.init()` creates the client and runs multiple `CREATE` statements before the backend is ready.
- Files: `carno.js/src/infra/ClickHouseService.ts`
- Cause: Schema setup is embedded in application startup.
- Improvement path: Keep idempotent local bootstrap for development, but move production migrations to a separate command or deployment step.

**Frontend graph layout runs synchronously in render memoization:**
- Problem: `layoutNodes()` performs graph ranking and barycentric sweeps on the main thread for each graph response, importance change, or selected item change.
- Files: `frontend/src/ui/App.tsx`
- Cause: Layout is computed inside `useMemo()` in the same module as rendering.
- Improvement path: Memoize layout only on graph data, keep selection styling separate, and move large graph layout to a worker if trace windows grow beyond the current 250-node default.

**SDK retry queue can drop older telemetry under pressure:**
- Problem: When `maxQueueSize` is exceeded, older events are removed; after retry exhaustion, the failed batch is dropped.
- Files: `sdk/nodejs/src/BatchExporter.ts`
- Cause: The SDK uses an in-memory bounded queue with no durable spool.
- Improvement path: Make dropping explicit in metrics/callbacks, allow users to configure loss policy, and add a durable exporter option for high-value traces.

## Fragile Areas

**Event bus durability is development-only:**
- Files: `carno.js/src/infra/events/InMemoryEventBus.ts`, `carno.js/src/infra/events/EventBus.ts`, `hono-server/src/infra/event-bus/internal/DevEventBus.ts`, `hono-server/src/infra/event-bus/api/IEventBus.ts`
- Why fragile: Events are in-memory and process-local. `carno.js` uses asynchronous microtask delivery that logs handler failures but does not retry. `hono-server` has no durable dedupe implementation.
- Safe modification: Preserve the small event bus contracts, then add a broker-backed implementation with durable publishing, idempotency, per-key ordering, and retry behavior.
- Test coverage: No tests cover duplicate delivery, handler failure, ordering, or recovery scans.

**ReplacingMergeTree read models require careful query discipline:**
- Files: `carno.js/src/infra/ClickHouseService.ts`, `carno.js/src/services/log/ReadModelRepository.ts`, `carno.js/src/services/log/TraceReadModelBuilder.ts`
- Why fragile: Rebuilds append replacement rows instead of deleting stale rows. Correct reads depend on `argMax(..., materialized_at_ms)` and monotonic materialization timestamps.
- Safe modification: Any new read query must select latest rows by `materialized_at_ms` and group by logical identity. Keep `TraceReadModelBuilder.nextMaterializedAtUnixMs()` monotonic within a process.
- Test coverage: No tests prove late events replace stale read rows or that stale nodes/edges disappear from projections after rebuilds.

**Manual route parsing in the frontend bypasses router dependency:**
- Files: `frontend/src/ui/App.tsx`, `frontend/package.json`
- Why fragile: `@tanstack/react-router` is installed, but navigation is implemented with `window.history.pushState()` and regex parsing.
- Safe modification: Either remove the unused router dependency or move route state to TanStack Router so URL parsing, navigation, and future route additions are centralized.
- Test coverage: No tests cover deep-linking, browser back/forward behavior, or invalid trace IDs.

**Empty scaffolding files can mislead implementers:**
- Files: `hono-server/src/infra/db/postgres.ts`, `hono-server/src/common/timestamp.ts`, `hono-server/src/services/auth/internal/util/jwt.ts`
- Why fragile: Empty files imply planned capabilities but provide no contract or implementation.
- Safe modification: Add minimal exported contracts/helpers when a capability is needed, or remove empty files until implementation starts.
- Test coverage: Not applicable; files contain no executable behavior.

**Error handling is not centralized in the active backend:**
- Files: `carno.js/src/routes/LogController.ts`, `carno.js/src/services/log/LogService.ts`, `hono-server/src/common/types.ts`, `hono-server/src/index.ts`
- Why fragile: Validation errors are thrown as generic `Error`; Hono has a custom `TopoTraceException` but no app-level error middleware. Client-facing error shape can vary by framework default.
- Safe modification: Add route-level or app-level error translation with stable response shapes and status codes before exposing new APIs.
- Test coverage: No tests assert validation error status codes or response bodies.

## Scaling Limits

**Trace reads are bounded by in-memory graph projection:**
- Current capacity: The frontend and backend default graph page size is 250 nodes; backend hard limit is 500 nodes per graph response.
- Limit: Very large traces still require all nodes and edges to be loaded in `ReadModelRepository.getProjectedGraph()` before page slicing.
- Scaling path: Add server-side windowed projection queries, cursor semantics based on flow order/materialization version, and query-level edge aggregation.

**Materializer recovery scans are polling-based:**
- Current capacity: `TraceReadModelWorker` defaults to 50 traces per recovery batch and a 30-second recovery interval.
- Limit: A large backlog materializes serially and can lag behind ingestion.
- Scaling path: Use durable event delivery as the primary trigger, add bounded worker concurrency, and track materialization lag metrics.

**SDK queue is process-memory-only:**
- Current capacity: The default max queue size is 10,000 events per process.
- Limit: Process exit, retry exhaustion, or sustained backend outage loses telemetry.
- Scaling path: Add callbacks/metrics for dropped events and a durable queue/exporter option.

## Dependencies at Risk

**`@carno.js/core`:**
- Risk: The documented verification notes that full TypeScript checking reports errors inside this dependency.
- Impact: `carno.js` cannot rely on a clean `tsc --noEmit` as a CI gate without filtering dependency issues or changing framework versions.
- Migration plan: Keep `bun run check` as the active backend build gate, pin the framework version, and evaluate whether the Hono migration should replace Carno before adding more Carno-specific decorators.

**`hono-server` Cloudflare ClickHouse client singleton:**
- Risk: `hono-server/src/infra/db/clickhouse/clickhouse.ts` caches the first ClickHouse client globally based on the first request's bindings.
- Impact: Different environments or tests in one process can reuse a client configured from earlier bindings.
- Migration plan: Add test reset hooks or per-environment client keys if multi-env tests run in one process. Keep the singleton only for one-env runtime deployments.

**`@tanstack/react-router`:**
- Risk: Installed but unused in the frontend.
- Impact: Dependency updates and bundle contents include routing code while navigation is manual.
- Migration plan: Either adopt it for `frontend/src/ui/App.tsx` route state or remove it from `frontend/package.json`.

## Missing Critical Features

**Automated tests:**
- Problem: No `*.test.*` or `*.spec.*` files are present, and `sdk/nodejs/package.json` has a `test` script that exits with an error.
- Blocks: Safe refactors to graph projection, read-model rebuilding, SDK batching, and auth/security behavior.

**Production authentication and authorization:**
- Problem: Active telemetry reads/writes are unauthenticated; Hono auth is not implemented.
- Blocks: Multi-user use, hosted deployments, and protected trace data.

**Durable event bus:**
- Problem: Both event bus implementations are development-oriented in-memory implementations.
- Blocks: Reliable materialization after process restart, horizontal scaling, and at-least-once delivery semantics.

**CI quality gates:**
- Problem: No root package or CI workflow coordinates backend, frontend, SDK builds, linting, and tests.
- Blocks: Consistent verification across the multi-package repo.

## Test Coverage Gaps

**Trace read-model builder:**
- What's not tested: Lifecycle merge, missing start/end diagnostics, orphan edges, cycle detection, negative duration handling, materialization timestamp monotonicity.
- Files: `carno.js/src/services/log/TraceReadModelBuilder.ts`
- Risk: Graph summaries and diagnostics can regress silently.
- Priority: High

**ClickHouse repositories and projection queries:**
- What's not tested: Raw event idempotency replay, latest-row selection with `argMax`, pagination cursors, hidden ghost nodes, ghost edge aggregation, JSON parse failures.
- Files: `carno.js/src/services/log/RawEventRepository.ts`, `carno.js/src/services/log/ReadModelRepository.ts`
- Risk: Large traces can return stale, missing, duplicated, or malformed graph data.
- Priority: High

**Worker/event bus behavior:**
- What's not tested: Event dedupe TTL, handler failure behavior, recovery scans, serial batch draining, and duplicate trace coalescing.
- Files: `carno.js/src/infra/events/InMemoryEventBus.ts`, `carno.js/src/services/log/worker/TraceReadModelWorker.ts`, `hono-server/src/infra/event-bus/internal/DevEventBus.ts`, `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts`
- Risk: Materialization can lag or fail without detection.
- Priority: High

**SDK exporter reliability:**
- What's not tested: Queue limits, retry budget, shutdown during active flush, uninitialized exporter behavior, backend error responses.
- Files: `sdk/nodejs/src/BatchExporter.ts`, `sdk/nodejs/src/Tracer.ts`, `sdk/nodejs/src/Span.ts`
- Risk: Telemetry can be silently dropped or shutdown can race with export.
- Priority: High

**Frontend graph workflows:**
- What's not tested: Trace selection, URL routing, back/forward handling, importance slider reset, cursor navigation, graph layout, inspector selection clearing.
- Files: `frontend/src/ui/App.tsx`, `frontend/src/api.ts`
- Risk: UI regressions can ship with only build verification.
- Priority: Medium

**Hono auth/security flows:**
- What's not tested: Signup, OTP validation, login token issuance, credential logging redaction, `JWT_SECRET` validation, repository failures.
- Files: `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`, `hono-server/src/services/auth/internal/repo/impl/AuthRepoPg.ts`, `hono-server/src/services/auth/internal/util/jwt.ts`
- Risk: Security-sensitive code can become exposed while incomplete.
- Priority: High

---

*Concerns audit: 2026-06-04*

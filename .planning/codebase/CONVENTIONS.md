# Coding Conventions

**Analysis Date:** 2026-06-04

## Naming Patterns

**Files:**
- Use PascalCase for class, controller, service, React component, and repository files: `frontend/src/ui/App.tsx`, `carno.js/src/routes/LogController.ts`, `carno.js/src/services/log/LogService.ts`, `sdk/nodejs/src/BatchExporter.ts`.
- Use interface-prefixed filenames for abstract service/repository contracts in `hono-server`: `hono-server/src/services/log/api/ILogService.ts`, `hono-server/src/infra/event-bus/api/IEventBus.ts`, `hono-server/src/services/auth/internal/repo/IAuthRepo.ts`.
- Use lowercase utility and barrel filenames for package entry points and shared helpers: `frontend/src/api.ts`, `frontend/src/types.ts`, `hono-server/src/common/logger.ts`, `hono-server/src/services/log/index.ts`, `sdk/nodejs/src/index.ts`.
- Use kebab-case only for generated or legacy package/config directories where already present: `hono-server`, `carno.js`, `sdk/nodejs`.

**Functions:**
- Use camelCase for functions and methods: `fetchGraph` in `frontend/src/api.ts`, `ingestEvents` in `carno.js/src/services/log/LogService.ts`, `createCarrierHeaders` in `sdk/nodejs/src/Span.ts`.
- Use verb-first method names for operations: `append`, `listTraces`, `getTraceSummary`, `processBatch`, `flush`, `shutdown`.
- Use private helper functions below the owning class/module for local transformations: `validateEvents`, `clampLimit`, `encodeCursor`, and `decodeCursor` in `carno.js/src/services/log/LogService.ts`; `parseJson` in `carno.js/src/services/log/RawEventRepository.ts`.
- Use static methods for SDK-facing `Tracer` APIs in `sdk/nodejs/src/Tracer.ts`; keep SDK consumer entry points on `Tracer` instead of exposing exporter internals.

**Variables:**
- Use camelCase for local variables, parameters, and object fields in TypeScript source: `activeTraceId`, `maxImportance`, `selectedItem` in `frontend/src/ui/App.tsx`; `receivedAtUnixMs` and `traceIds` in `carno.js/src/services/log/RawEventRepository.ts`.
- Use UPPER_SNAKE_CASE for module constants: `API_BASE_URL` and `REQUEST_TIMEOUT_MS` in `frontend/src/api.ts`; `DEFAULT_LIMIT` and `MAX_LIMIT` in `carno.js/src/services/log/LogService.ts`.
- Use snake_case only for database row projections and ClickHouse column names: `trace_id`, `event_id`, `occurred_at_ms` in `carno.js/src/services/log/RawEventRepository.ts`.
- Use explicit nullable state names for React state values that may be absent: `cursor: string | null`, `selectedItem: Inspectable | null`, and `activeTraceId` in `frontend/src/ui/App.tsx`.

**Types:**
- Use PascalCase for exported types and interfaces: `TraceEventInput`, `GraphWindowResponse`, `TraceSummary`, `RawEventStore` in `carno.js/src/services/log/types.ts` and `carno.js/src/services/log/contracts.ts`.
- Use discriminated unions for route or finite UI state where practical: `AppRoute` in `frontend/src/ui/App.tsx`.
- Use abstract classes with `I` prefix in `hono-server` service/repository boundaries: `ILogService`, `ILogWriteRepo`, `IEventBus`, and `IAuthService`.
- Use type-only imports for pure TypeScript shapes: `import type { GraphWindowResponse } from "../types"` in `frontend/src/ui/App.tsx`, `import type { IEventBus }` in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.

## Code Style

**Formatting:**
- No Prettier, Biome, or ESLint configuration is detected in the repo root or package directories.
- Follow the existing two-space indentation, semicolon-terminated TypeScript style used in `frontend/src/api.ts`, `hono-server/src/index.ts`, `sdk/nodejs/src/Tracer.ts`, and `carno.js/src/services/log/LogService.ts`.
- Use double quotes for string literals in TypeScript source.
- Prefer trailing commas in multiline object literals, arrays, imports, function calls, and constructor parameter lists, as shown in `frontend/src/ui/App.tsx` and `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
- Keep short guard clauses single-line when already clear: `if (!summary) return null;` in `carno.js/src/services/log/LogService.ts`, `if (this.isFinished) return;` in `sdk/nodejs/src/Span.ts`.

**Linting:**
- No lint runner is configured for `frontend`, `carno.js`, or `sdk/nodejs`.
- `hono-server/package.json` provides `fallow`, `fallow:full`, `fallow:health`, and `fallow:fix` scripts for codebase audit/health, backed by `.fallow/` cache files.
- TypeScript strict mode is enabled in all package tsconfigs: `frontend/tsconfig.app.json`, `hono-server/tsconfig.json`, `sdk/nodejs/tsconfig.json`, and `carno.js/tsconfig.json`.
- `carno.js/tsconfig.json` additionally enables `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, and `noImplicitOverride`; preserve these stricter checks when adding code under `carno.js/src`.

## Import Organization

**Order:**
1. External runtime/framework imports first: `@tanstack/react-query`, `react`, `@xyflow/react` in `frontend/src/ui/App.tsx`; `hono` in `hono-server/src/index.ts`; `uuid` in `sdk/nodejs/src/Tracer.ts`.
2. Side-effect style imports next when needed: `@xyflow/react/dist/style.css` in `frontend/src/ui/App.tsx`.
3. Local value imports after external imports: `fetchGraph`, `fetchTraces` in `frontend/src/ui/App.tsx`; `BatchExporter`, `TraceNode`, `normalizeImportance` in `sdk/nodejs/src/Tracer.ts`.
4. Local type-only imports last or alongside the local module group using `import type`: `frontend/src/ui/App.tsx`, `carno.js/src/services/log/RawEventRepository.ts`.

**Path Aliases:**
- No TypeScript path aliases are configured in `frontend/tsconfig.app.json`, `hono-server/tsconfig.json`, `sdk/nodejs/tsconfig.json`, or `carno.js/tsconfig.json`.
- Use relative imports within each package. Do not introduce `@/` or package-local aliases unless the relevant tsconfig and build tools are updated together.
- Keep package boundaries separate: `frontend/src` imports frontend-local `../api` and `../types`; `sdk/nodejs/src` imports from sibling SDK modules; `carno.js/src` imports from `carno.js/src` and external services.

## Error Handling

**Patterns:**
- Validate API input at service boundaries and throw `Error` with specific messages for invalid requests, as in `validateEvents` in `carno.js/src/services/log/LogService.ts`.
- Return `null` for not-found graph/summary reads instead of throwing, as in `getTraceSummary` and `getGraph` in `carno.js/src/services/log/LogService.ts` and `fetchTraceSummary`/`fetchGraph` in `frontend/src/api.ts`.
- Use `try/catch` around orchestrated service operations that must be logged before rethrowing, as in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` and `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`.
- For lossy background SDK operations, catch and warn rather than throw into user code: `sdk/nodejs/src/BatchExporter.ts` requeues failed batches until retry budget is exhausted.
- Convert malformed JSON or invalid cursor input into safe defaults where the data is auxiliary: `parseJson` in `carno.js/src/services/log/RawEventRepository.ts` returns `{}` and `decodeCursor` in `carno.js/src/services/log/LogService.ts` returns `null`.

## Logging

**Framework:** `tslog` in `hono-server`; `console` in `carno.js` worker/event bus and `sdk/nodejs`.

**Patterns:**
- In `hono-server`, derive component loggers from `rootLogger` using `getSubLogger({ name })`, as in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` and `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts`.
- Use structured metadata for operational logs where possible: `LogServiceImpl.ingestNodesNEdges` logs counts and `userId` in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
- Use scoped console prefixes for background workers and SDK exporter failures: `[TraceReadModelWorker]` in `carno.js/src/services/log/worker/TraceReadModelWorker.ts`, `[TopoTracer]` in `sdk/nodejs/src/BatchExporter.ts`.
- Avoid logging secrets or full credential-bearing payloads. `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts` currently logs serialized signup/auth input; new auth code should prefer redacted fields.

## Comments

**When to Comment:**
- Use comments to explain domain invariants or ordering/idempotency constraints, as in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`.
- Use comments for non-obvious operational tradeoffs, such as bounded rebuild parallelism in `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts`.
- Avoid comments that restate method names or simple statements.

**JSDoc/TSDoc:**
- JSDoc/TSDoc is not used consistently in current source files.
- Prefer self-describing types and exported type names over adding docblocks for routine functions.
- Add TSDoc only for new public SDK APIs in `sdk/nodejs/src` when the call contract is not obvious from the type signature.

## Function Design

**Size:** Keep feature orchestration in methods and extraction in local helpers. `carno.js/src/services/log/LogService.ts` keeps validation, clamping, cursor encoding, and cursor decoding as module-local functions below the class.

**Parameters:** Use object parameters for multi-field inputs and constructor dependencies. Examples: `fetchGraph(input)` in `frontend/src/api.ts`, `ingestNodesNEdges(data)` in `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`, `TraceNode` constructor input in `sdk/nodejs/src/Span.ts`.

**Return Values:** Use explicit `Promise<T>` annotations on exported async functions and service methods. Use typed DTOs for API responses: `TraceListResponse`, `TraceSummary`, `GraphWindowResponse` in `frontend/src/types.ts` and `carno.js/src/services/log/types.ts`.

## Module Design

**Exports:** Use named exports for classes, services, types, and helpers. Default exports are limited to framework entry points such as `hono-server/src/index.ts`.

**Barrel Files:** Use small barrel/index files for service instances or package exports: `hono-server/src/services/log/index.ts`, `hono-server/src/services/auth/index.ts`, `sdk/nodejs/src/index.ts`. Avoid large catch-all barrels that obscure package boundaries.

---

*Convention analysis: 2026-06-04*

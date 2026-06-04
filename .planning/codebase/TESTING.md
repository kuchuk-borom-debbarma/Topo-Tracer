# Testing Patterns

**Analysis Date:** 2026-06-04

## Test Framework

**Runner:**
- Not detected. No Jest, Vitest, Bun test, Playwright, Cypress, or Testing Library configuration is present in the repo.
- Config: Not detected. Searches found no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`, `.spec.*`, `.test.*`, or `__tests__/` files.
- `sdk/nodejs/package.json` contains a placeholder `test` script that exits with an error: `echo "Error: no test specified" && exit 1`.

**Assertion Library:**
- Not detected.

**Run Commands:**
```bash
cd frontend && npm run build          # Typecheck and production build
cd carno.js && bun run check          # Bun bundle check
cd sdk/nodejs && npm run build        # SDK TypeScript build
cd hono-server && npm run fallow      # Fallow audit for hono-server
```

## Test File Organization

**Location:**
- Automated test files are not present.
- Current verification guidance lives in `docs/DEVELOPMENT_AND_VERIFICATION.md`.
- Runtime smoke checks are performed against the local backend, frontend, seed script, SDK examples, and graph endpoints rather than committed test suites.

**Naming:**
- No established test filename convention exists.
- Use `*.test.ts` or `*.test.tsx` colocated with the code only after selecting and configuring a runner for the package being tested.

**Structure:**
```text
frontend/src/                 # No test files detected
carno.js/src/                 # No test files detected
hono-server/src/              # No test files detected
sdk/nodejs/src/               # No test files detected
docs/DEVELOPMENT_AND_VERIFICATION.md  # Manual verification checklist
```

## Test Structure

**Suite Organization:**
```typescript
// Not established in this repo.
// Add suites only after a runner is configured in the target package.
```

**Patterns:**
- Use build checks as the current minimum verification gate.
- Use manual API smoke checks from `docs/DEVELOPMENT_AND_VERIFICATION.md` for trace ingestion and graph projection behavior.
- Use SDK example scripts in `sdk/nodejs/example` as executable smoke scenarios.
- Verify frontend behavior through `frontend` build plus local browser smoke checks against the backend.

## Mocking

**Framework:** Not detected.

**Patterns:**
```typescript
// Not established in this repo.
// Prefer dependency injection already present in services instead of module-level mocks.
```

**What to Mock:**
- For `carno.js/src/services/log/LogService.ts`, mock or fake `RawEventRepository`, `ReadModelRepository`, and `EventBus` constructor dependencies.
- For `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`, pass fake `IEventBus` and `ILogWriteRepo` instances through the constructor.
- For `sdk/nodejs/src/BatchExporter.ts`, mock global `fetch`, timers, and `setImmediate` once a runner supports them.
- For `frontend/src/api.ts`, mock `fetch` and `AbortController` timing behavior.

**What NOT to Mock:**
- Do not mock pure helper functions such as `normalizeImportance` in `sdk/nodejs/src/importance.ts`; test their real behavior.
- Do not mock DTO/type modules such as `frontend/src/types.ts`, `carno.js/src/services/log/types.ts`, or `sdk/nodejs/src/types.ts`.
- Do not mock internal service methods when the observable behavior can be tested through the public method on the class.

## Fixtures and Factories

**Test Data:**
```typescript
// Current executable fixtures are examples, not automated factories:
// sdk/nodejs/example/basic_usage.ts
// sdk/nodejs/example/monolith_sync_flow.ts
// sdk/nodejs/example/distributed_saga_compensation.ts
```

**Location:**
- SDK smoke/example data lives in `sdk/nodejs/example`.
- Manual seed data generation lives in `carno.js/scripts/generate-mock.ts`.
- No shared fixture or factory directory exists.

## Coverage

**Requirements:** None enforced.

**View Coverage:**
```bash
# Not available until a test runner and coverage provider are added.
```

## Test Types

**Unit Tests:**
- Not implemented.
- Natural unit-test targets include `sdk/nodejs/src/importance.ts`, `carno.js/src/services/log/LogService.ts` validation/cursor helpers through public service behavior, and `carno.js/src/services/log/RawEventRepository.ts` JSON row mapping with a fake ClickHouse client.

**Integration Tests:**
- Not implemented as automated tests.
- Manual integration coverage is documented in `docs/DEVELOPMENT_AND_VERIFICATION.md` with local ClickHouse, backend, seed, and graph endpoint checks.
- `carno.js/scripts/generate-mock.ts` and `sdk/nodejs/example/*.ts` act as integration smoke drivers when the backend is running.

**E2E Tests:**
- Not used.
- Current frontend E2E verification is manual: start `carno.js` backend, run `frontend` dev server, seed data, then inspect the trace rail, graph header, graph canvas, and inspector according to `docs/DEVELOPMENT_AND_VERIFICATION.md`.

## Common Patterns

**Async Testing:**
```typescript
// Not established.
// Current async verification uses build/smoke commands rather than test assertions.
```

**Error Testing:**
```typescript
// Not established.
// Existing error behavior to preserve:
// - frontend/src/api.ts throws Error("Request failed: <status>") for non-OK responses.
// - carno.js/src/services/log/LogService.ts throws validation errors for malformed events.
// - sdk/nodejs/src/BatchExporter.ts catches failed flushes and requeues or drops batches.
```

---

*Testing analysis: 2026-06-04*

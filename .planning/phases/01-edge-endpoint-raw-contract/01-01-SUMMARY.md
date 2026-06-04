---
phase: 01-edge-endpoint-raw-contract
plan: 01
subsystem: api
tags: [hono, log-service, edge-ingest, bun-test]
requires: []
provides:
  - Public edge start ingest contract with explicit endpoint fields.
  - Runtime service validation for missing or blank edge endpoint fields.
  - Focused Bun tests for endpoint validation and publish-after-persist behavior.
affects: [phase-01, phase-02, read-model-materialization]
tech-stack:
  added: []
  patterns:
    - Service-owned validation before repository persistence.
    - Bun tests with fake repository and event bus contracts.
key-files:
  created:
    - hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts
    - hono-server/src/test-support/bun-test.d.ts
  modified:
    - hono-server/src/services/log/api/types.ts
    - hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts
key-decisions:
  - "Validate only endpoint presence/non-empty strings at ingest time; endpoint existence remains deferred to materialization diagnostics."
  - "Allow self-edges when endpoint strings are non-empty."
  - "Keep safe logging to IDs and counts; do not log raw edge data payloads."
patterns-established:
  - "Use fake service dependencies to prove orchestration ordering without ClickHouse or route tests."
  - "Keep public ingest fields in plain api/types.ts shapes."
requirements-completed: [RSCH-01]
duration: 11min
completed: 2026-06-04
---

# Phase 01: Edge Endpoint Raw Contract Plan 01 Summary

**Explicit Hono edge-start endpoints with service-side validation before append-only persistence**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-04T10:40:00Z
- **Completed:** 2026-06-04T10:51:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Added `fromNodeId`, `toNodeId`, and `data` to the public `IngestEdgeStart` contract.
- Added `LogServiceImpl` validation that rejects missing or blank endpoint fields before repository persistence.
- Preserved self-edge acceptance, unknown endpoint acceptance, and publish-after-persist ordering.
- Added focused Bun tests for malformed edge starts, self-edge acceptance, and no publish after failed persistence.

## Task Commits

1. **Task 1: Create Wave 0 service contract tests for RSCH-01** - `04ac071` (test)
2. **Task 2: Add public edge-start endpoint fields and service validation** - `b1ec927` (feat)

## Files Created/Modified

- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` - Bun tests with fake `ILogWriteRepo` and `IEventBus`.
- `hono-server/src/test-support/bun-test.d.ts` - Minimal local `bun:test` declaration for `tsc --noEmit`.
- `hono-server/src/services/log/api/types.ts` - Public edge start endpoint and data fields.
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` - Pre-persistence endpoint validation helper.

## Decisions Made

- Used plain `Error("Edge start requires fromNodeId and toNodeId.")` for service validation failures because no route/error translation work is in scope.
- Used a local ambient declaration for the small `bun:test` surface instead of adding a package dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added local `bun:test` declaration for TypeScript verification**
- **Found during:** Task 2 verification
- **Issue:** `bun x tsc --noEmit --project tsconfig.json` could not resolve `bun:test` types for the new Bun tests.
- **Fix:** Added `hono-server/src/test-support/bun-test.d.ts` with the minimal test APIs used by current tests.
- **Files modified:** `hono-server/src/test-support/bun-test.d.ts`
- **Verification:** `bun x tsc --noEmit --project tsconfig.json` exits 0.
- **Committed in:** `b1ec927`

---

**Total deviations:** 1 auto-fixed (1 blocking verification infrastructure issue).
**Impact on plan:** No product scope change. The declaration only lets existing Bun tests type-check without adding dependencies.

## Issues Encountered

- Initial RED test failed as expected because malformed edge starts were accepted before validation was added.
- `bun run fallow` reports inherited unreachable-file findings in the early Hono scaffold, but the audit gate excluded them and reported no issues in changed files.

## Verification

- `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts` - passed.
- `cd hono-server && bun x tsc --noEmit --project tsconfig.json` - passed.
- `cd hono-server && bun run fallow` - gated audit passed with inherited findings excluded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 can use the updated `IngestEdgeStart` endpoint fields when mapping raw ClickHouse edge rows.

## Self-Check: PASSED

- Key files exist on disk.
- `RSCH-01` is implemented and covered by focused tests.
- Publish-after-persist behavior is preserved and tested.
- Scope stayed inside `hono-server`.

---
*Phase: 01-edge-endpoint-raw-contract*
*Completed: 2026-06-04*

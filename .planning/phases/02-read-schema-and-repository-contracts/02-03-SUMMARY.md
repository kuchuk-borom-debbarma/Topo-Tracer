---
phase: 02-read-schema-and-repository-contracts
plan: 03
subsystem: log-service
tags: [clickhouse, repository, mapping]
requirements: [RSCH-03, RSCH-05, RSCH-07, RSCH-08, RSCH-09]
key_files:
  - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts
  - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts
  - hono-server/src/services/log/internal/repo/index.ts
  - hono-server/src/services/log/internal/repo/types.ts
status: complete
metrics:
  duration: 15min
  tasks: 3
  files: 4
---

# Phase 2 Plan 03: ClickHouse Read Repository Skeleton Summary

## One-liner
Implemented `LogReadRepoClickHouse` with validated row mapping for nodes, edges, summaries, and materialization checkpoints.

## Key Decisions
- **JSONEachRow Format:** Used `JSONEachRow` for all read-model inserts to ensure consistency with existing raw event ingestion patterns (D-11).
- **Client Provider Pattern:** Adhered to the `getInitializedClickHouseClient` provider pattern, ensuring the repository remains testable with fake clients.
- **Unified Row Mapping:** Consolidated node, edge, summary, and checkpoint mapping logic within the concrete repository implementation, hiding ClickHouse-specific snake_case details from the rest of the application (D-09, D-10).
- **Factory Wiring:** Replaced the static `logReadRepo` singleton with a factory function `createLogReadRepo(parentLogger)`, matching the `ILogWriteRepo` pattern for improved dependency injection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Field name mismatch between types and DDL**
- **Found during:** Task 2 (implementation)
- **Issue:** Several field names in `internal/repo/types.ts` (defined in 02-01) did not match the ClickHouse DDL column names defined in 02-02 (e.g., `diag_missing_starts` vs `diagnostic_missing_starts_count`).
- **Fix:** Updated `internal/repo/types.ts` to strictly match the ClickHouse DDL column names.
- **Files modified:** `hono-server/src/services/log/internal/repo/types.ts`
- **Commit:** `227d291`

### Known Deviations
- **Placeholder Implementation:** As specified in the plan, `loadCheckpoint` and `loadLatestReadModel` are implemented as placeholders that throw "not implemented until Phase 3" errors, as their full logic depends on materialization strategies defined in the next phase.

## Self-Check: PASSED
- [x] `LogReadRepoClickHouse` exists behind `ILogReadRepo`.
- [x] Fake-client tests prove read rows and checkpoint rows map to ClickHouse inserts.
- [x] `createLogReadRepo` is exported from repo wiring.
- [x] No materialization, projection, or route behavior is implemented.
- [x] Full Hono verification commands pass.

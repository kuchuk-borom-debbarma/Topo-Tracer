---
phase: 01-edge-endpoint-raw-contract
plan: 02
subsystem: database
tags: [hono, clickhouse, edge-events, raw-events, bun-test]
requires:
  - phase: 01-01
    provides: Public `IngestEdgeStart` endpoint fields used by raw row mapping.
provides:
  - Raw node and edge row types with split lifecycle timestamp columns.
  - Raw edge event mapping with explicit endpoint columns and edge data.
  - Development ClickHouse DDL for endpoint and lifecycle raw event columns.
affects: [phase-02, read-schema, materialization, graph-projection]
tech-stack:
  added: []
  patterns:
    - Constructor-injected ClickHouse client provider for repository tests with singleton default in production.
    - JSONEachRow row assertions through fake ClickHouse insert calls.
key-files:
  created:
    - hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts
  modified:
    - hono-server/src/services/log/internal/repo/types.ts
    - hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts
    - hono-server/src/infra/db/clickhouse/schema.ts
key-decisions:
  - "Use `started_at_ms` and `ended_at_ms` nullable lifecycle columns instead of a generic `timestamp_ms` column."
  - "Persist graph endpoints only in explicit `from_node_id` and `to_node_id` columns; keep `data` as payload."
  - "Use `ORDER BY (user_id, trace_id, id, event_type)` so nullable lifecycle columns are not part of the sorting key."
patterns-established:
  - "Repository tests inject a fake ClickHouse client provider while production keeps `getInitializedClickHouseClient()` as the default."
  - "Edge end rows remain lifecycle-only with null endpoint/type fields and empty data."
requirements-completed: [RSCH-02]
duration: 6min
completed: 2026-06-04
---

# Phase 01: Edge Endpoint Raw Contract Plan 02 Summary

**Raw ClickHouse edge rows now persist explicit endpoints, payload data, and split lifecycle timestamps**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T10:52:00Z
- **Completed:** 2026-06-04T10:57:41Z
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments

- Added focused repository tests that capture ClickHouse `JSONEachRow` insert values without a live ClickHouse server.
- Replaced raw row `timestamp_ms` with `started_at_ms` and `ended_at_ms` on node and edge row types.
- Mapped edge start rows to explicit `from_node_id`, `to_node_id`, and `data` fields.
- Kept edge end rows lifecycle-only with `ended_at_ms` set and endpoint/type fields null.
- Updated development ClickHouse DDL for raw node and edge events, using a non-null sorting key.

## Task Commits

1. **Task 1: Create Wave 0 repository mapping tests for RSCH-02** - `1ea2b23` (test)
2. **Task 2: Map raw row lifecycle and endpoint columns** - `9b242fb` (feat)
3. **Task 3: Update development ClickHouse raw DDL** - `85d6b9f` (feat)

## Files Created/Modified

- `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` - Captures fake ClickHouse inserts and asserts endpoint/lifecycle row values.
- `hono-server/src/services/log/internal/repo/types.ts` - Defines repo-private split lifecycle and endpoint row fields.
- `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` - Maps public ingest inputs to the new raw row shape.
- `hono-server/src/infra/db/clickhouse/schema.ts` - Defines development ClickHouse raw node and edge table DDL with explicit lifecycle and endpoint columns.

## Decisions Made

- Added a constructor-injected ClickHouse client provider to `LogWriteRepoClickHouse` for tests, preserving `getInitializedClickHouseClient()` as the default production path.
- Used nullable endpoint columns for edge end rows because end inputs intentionally remain lifecycle-only.
- Kept the DDL migration-free per D-15 because this Hono schema is still development-mode.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial RED repository test failed as expected because `LogWriteRepoClickHouse` still used the initialized singleton client and old row shape.
- Live ClickHouse DDL smoke was skipped because `curl -fsS --max-time 2 http://localhost:8123/ping` failed to connect. The command to retry after starting ClickHouse is: initialize or create/drop the final `CLICKHOUSE_CREATE_NODE_EVENTS_TABLE` and `CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE` strings against an isolated database or scratch table names.
- `bun run fallow` reports inherited unused-export findings in the early Hono scaffold, but the audit gate excluded them and reported no issues in changed files.

## Verification

- `cd hono-server && bun test ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` - passed.
- `cd hono-server && bun test` - passed.
- `cd hono-server && bun x tsc --noEmit --project tsconfig.json` - passed.
- `cd hono-server && bun run fallow` - gated audit passed with inherited findings excluded.
- Conditional ClickHouse smoke - skipped, ClickHouse unavailable at `http://localhost:8123`.

## User Setup Required

None - no external service configuration required for automated checks.

## Next Phase Readiness

Phase 2 can build read schema and repository contracts on top of raw `edge_events` rows that now include canonical endpoints and lifecycle fields.

## Self-Check: PASSED

- Key files exist on disk.
- `RSCH-02` is implemented and covered by focused repository tests.
- Raw node and edge row types no longer contain `timestamp_ms`.
- `schema.ts` contains `from_node_id Nullable(String)`, `to_node_id Nullable(String)`, and `data Map(String, String)` for `edge_events`.
- Scope stayed inside `hono-server`.

---
*Phase: 01-edge-endpoint-raw-contract*
*Completed: 2026-06-04*

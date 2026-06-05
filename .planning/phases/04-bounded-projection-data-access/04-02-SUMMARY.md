---
phase: 04-bounded-projection-data-access
plan: 02
subsystem: hono-server
tags:
  - repo
  - clickhouse
  - projection
dependency_graph:
  requires:
    - 04-01
  provides:
    - Bounded visible-node ClickHouse data access.
  affects:
    - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts
tech_stack:
  added:
    - ClickHouse LIMIT cap + 1 probe pattern.
key_files:
  created: []
  modified:
    - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts
    - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts
decisions:
  - D-01/D-03: Use `LIMIT cap + 1` to detect cap-hit in a single round trip.
  - D-04/D-05: Enforce `DEFAULT_PROJECTION_NODE_CAP` internally in the repository.
  - D-12: Forbid `loadBoundedVisibleNodes` from calling `loadLatestReadModel` to ensure performance.
metrics:
  duration: 10m
  completed_date: "2024-03-21"
---

# Phase 04 Plan 02: Bounded Visible-Node Data Access Summary

Implemented `loadBoundedVisibleNodes` in `LogReadRepoClickHouse`, providing a capped, threshold-filtered, trace-scoped read of latest materialised nodes.

## Key Changes

### hono-server

#### Bounded Node Access
- Implemented `loadBoundedVisibleNodes` with `argMax` latest-state selection.
- Added `LIMIT DEFAULT_PROJECTION_NODE_CAP + 1` probe to detect if the node cap was reached.
- Scoped query by `user_id` and `trace_id` with `importance_level <= threshold` filtering.
- Returns `BoundedVisibleNodesResult` including cap metadata (`cap`, `returnedCount`, `capHit`).

#### Test Coverage
- Added fake-client tests for cap-hit scenario (returning `DEFAULT_PROJECTION_NODE_CAP + 1` rows).
- Added fake-client tests for non-cap-hit scenario and full field mapping.
- Added source assertion test to ensure no accidental calls to `loadLatestReadModel` from the bounded method.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | 134 | `loadBoundedVisibleEdges` is stubbed as it is scheduled for implementation in 04-03-PLAN.md. |

## Self-Check: PASSED

- [x] `loadBoundedVisibleNodes` implemented and exports `BoundedVisibleNodesResult`.
- [x] Tests in `LogReadRepoClickHouse.test.ts` pass and cover cap/non-cap cases.
- [x] No calls to `loadLatestReadModel` in `loadBoundedVisibleNodes`.
- [x] Commits 1c5f318, a8e5160, 3b6b279 exist.

---
phase: 04-bounded-projection-data-access
plan: 03
subsystem: log-read-repo
tags:
  - clickhouse
  - projection
  - performance
  - safety
dependency_graph:
  requires:
    - 04-02
  provides:
    - Bounded visible-node edge reads for Phase 5 projection service.
  affects:
    - LogReadRepoClickHouse implementation and tests.
tech_stack:
  added:
    - ClickHouse array function `has()` for endpoint filtering.
    - ClickHouse scalar function `least()` for flow-order based edge sorting.
key_files:
  created:
    - .planning/phases/04-bounded-projection-data-access/04-TECHNICAL.md
  modified:
    - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts
    - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts
decisions:
  - "D-19: Use `least(from_flow_order, to_flow_order)` for deterministic edge sorting in bounded projections."
  - "D-20: Short-circuit `loadBoundedVisibleEdges` for empty `nodeIds` to avoid unnecessary ClickHouse queries."
metrics:
  duration: 15min
  completed_date: "2026-06-05"
---

# Phase 04 Plan 03: Bounded Visible-Node Edge Reads Summary

Implemented bounded visible-node edge data access in the ClickHouse repository, completing the Phase 4 data-access layer. This enables Phase 5 to perform ghost projection and edge snapping without scanning all trace edges.

## Key Changes

### `LogReadRepoClickHouse` Implementation

- Added `loadBoundedVisibleEdges` method.
- Implemented `LIMIT cap + 1` probe pattern with `DEFAULT_PROJECTION_EDGE_CAP` (2000).
- Used grouped `argMax` to select the latest materialized state for edges.
- Added endpoint filtering using `has({nodeIds:Array(String)}, from_node_id) OR has({nodeIds:Array(String)}, to_node_id)`.
- Implemented deterministic ordering by `least(from_flow_order, to_flow_order) ASC, id ASC`.
- Added short-circuit return for empty `nodeIds`.

### Safety and Boundary Assertions

- Added fake-client tests for `loadBoundedVisibleEdges` verifying trace-scoping, filtering, and cap behavior.
- Added source-code assertions in tests ensuring bounded methods do not call the full trace loader (`loadLatestReadModel`).
- Added source-boundary tests ensuring no leaks of Phase 5+ features (ghost, snapped, etc.) or cross-cutting concerns (frontend, sdk, etc.).

### Documentation

- Created `04-TECHNICAL.md` detailing the Phase 4 repository contract, cap constants, query patterns, and deferred ghost logic.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `loadBoundedVisibleEdges` scopes reads by `userId` and `traceId`.
- [x] Edge reads filter to edges touching supplied visible node ids.
- [x] Empty visible node id input returns no query and `capHit: false`.
- [x] Query uses grouped `argMax` latest-state selection and deterministic ordering.
- [x] Query uses `LIMIT DEFAULT_PROJECTION_EDGE_CAP + 1`.
- [x] Returned edges are sliced to `DEFAULT_PROJECTION_EDGE_CAP` and cap metadata reports `capHit`.
- [x] Production bounded projection methods do not call full latest-state loader.
- [x] Phase 4 technical docs explain cap behavior and deferred ghost projection.
- [x] No HTTP routes, ghost projection logic, frontend, SDK, or `carno.js` files are touched.
- [x] All 56 tests passing.

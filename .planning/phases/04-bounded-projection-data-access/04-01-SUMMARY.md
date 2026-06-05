---
phase: 04-bounded-projection-data-access
plan: 01
subsystem: log-service
tags: [contract, projection, repository]
dependency_graph:
  requires: [03-03]
  provides: [projection-contract]
  affects: [ILogReadRepo, LogReadRepoClickHouse]
tech_stack:
  added: []
  patterns: [bounded-projection, repository-cap-constants]
key_files:
  created: []
  modified:
    - hono-server/src/services/log/api/types.ts
    - hono-server/src/services/log/internal/repo/ILogReadRepo.ts
    - hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts
decisions:
  - Repository-level cap constants (500 nodes, 2000 edges) are used instead of caller-provided limits for v1.
  - Projection result types carry explicit cap metadata (capHit, returnedCount) to inform the UI about truncated data.
metrics:
  duration: 15m
  completed_date: 2024-06-05
---

# Phase 04 Plan 01: Bounded Projection Contract Summary

Defined the bounded projection contract for the log read repository, ensuring that future ClickHouse query implementations have explicit, capped interfaces.

## Key Changes

### Public API Types
- Added `ProjectionReadCap` type containing `cap`, `returnedCount`, and `capHit`.
- Added `BoundedVisibleNodesResult` and `BoundedVisibleEdgesResult` which wrap `ReadNode[]` and `ReadEdge[]` with cap metadata.
- Ensured no leakage of internal database or ghost projection types into the public API.

### Repository Contract
- Exported `DEFAULT_PROJECTION_NODE_CAP = 500` and `DEFAULT_PROJECTION_EDGE_CAP = 2000` from `ILogReadRepo.ts`.
- Added `loadBoundedVisibleNodes` and `loadBoundedVisibleEdges` abstract methods to `ILogReadRepo`.
- Method signatures require `userId` and `traceId` for strict scoping.
- Threshold-based filtering is supported for nodes.

### Contract Assertions
- Updated `ILogReadRepo.test.ts` to include source assertions for the new types and methods.
- Added negative assertions to forbid unbounded projection names (e.g., `loadAllNodesForProjection`) and environment-driven limit parameters.
- Verified that all existing materialization tests still pass.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

1. Created files exist: N/A (all modifications)
2. Commits exist:
   - `cea5e19`: feat(04-01): add projection cap DTOs and constants
   - `8448430`: feat(04-01): extend ILogReadRepo with bounded projection methods
   - `c90ad84`: test(04-01): update contract assertions for projection safety
3. Tests pass: `cd hono-server && bun test` passed 50 tests.

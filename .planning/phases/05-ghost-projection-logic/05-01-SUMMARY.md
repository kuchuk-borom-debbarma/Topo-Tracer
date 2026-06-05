---
phase: 05-ghost-projection-logic
plan: 01
subsystem: log-read-repo
tags: [projection, ghosting, clickhouse, contract]
requires: [GPRJ-01, GPRJ-02, GPRJ-03, GPRJ-04, GPRJ-09]
provides: [projection-dtos, bounded-projection-input]
affects: [LogReadRepoClickHouse]
tech-stack: [hono, clickhouse, bun]
key-files:
  - hono-server/src/services/log/api/types.ts
  - hono-server/src/services/log/internal/repo/ILogReadRepo.ts
  - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts
decisions:
  - Reused argMax latest-node logic for bounded projection reads to ensure consistency with visible nodes.
  - Locked Ghost DTO shape with deterministic ID and flow ranges before algorithm implementation.
  - Used LIMIT cap + 1 for single-trip cap-hit detection.
metrics:
  duration: 15min
  completed_date: "2026-06-05"
---

# Phase 05 Plan 01: Projection Contracts and Bounded Reads Summary

Defined Phase 5 projection DTOs and implemented capped repository reads for projection-node inputs.

## Key Changes

### 1. Projection DTOs (api/types.ts)
Defined explicit types for projected graphs to support runtime ghosting:
- `ProjectedNormalNode`: Carries all standard read-node fields with `kind: "normal"`.
- `ProjectedGhostNode`: Encapsulates summarized hidden data (`hiddenNodeCount`, `hiddenEdgeCount`, `nodeTypeCounts`) and deterministic ranges (`flowOrderStart`, `flowOrderEnd`).
- `ProjectedGraphEdge`: Includes `edgeCount` for potentially aggregated edges.
- `ProjectedGraphMetadata`: Reports threshold, visible/ghost counts, and cap hit status.

### 2. Bounded Repository Contract (ILogReadRepo)
Added `loadBoundedProjectionNodes` to the repository interface. This method provides the raw, latest-node input for the in-memory projector, including nodes below the visibility threshold.

### 3. ClickHouse Implementation (LogReadRepoClickHouse)
Implemented `loadBoundedProjectionNodes` using ClickHouse `argMax` to fetch the latest state of all nodes for a trace:
- **Capping:** Enforces `DEFAULT_PROJECTION_NODE_CAP + 1` to detect truncation in a single round trip.
- **Ordering:** Ensures deterministic flow-order sorting (`ORDER BY flow_order ASC, id ASC`).
- **Isolation:** Explicitly avoids calling `loadLatestReadModel` to prevent loading large edge sets or summaries when only nodes are needed for the first pass of projection.

## Verification Results

### Automated Tests
- `ILogReadRepo.test.ts`: 19 tests passed (validating contract presence and absence of forbidden ancestry paths).
- `LogReadRepoClickHouse.test.ts`: 32 tests passed (validating capped query logic and field mapping).
- Full suite: 61 tests passed in `hono-server`.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- [x] Projection DTOs exist with all required fields.
- [x] Ghost DTOs include summary and range fields.
- [x] Repository exposes `loadBoundedProjectionNodes`.
- [x] ClickHouse implementation is capped and correctly ordered.
- [x] No ancestry paths or leaking of ClickHouse terms in API types.

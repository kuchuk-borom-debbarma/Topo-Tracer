# Phase 2: Service-Level Projection - Summary

**Date:** 2026-06-08
**Status:** COMPLETE
**Wave:** 1

## Completed Work

### Service-Level Paging Orchestration
- **Repository Extension:** Added `loadTraceSummary` to `ILogReadRepo` and `LogReadRepoClickHouse` to efficiently fetch trace versioning metadata.
- **Conflict Handling:** Implemented `ConflictError` in `hono-server/src/common/types.ts` to support 409 Conflict responses for stale paging cursors.
- **LogServiceImpl Integration:** Updated `projectTraceGraph` to:
    - Decode opaque Base64 cursors into internal offsets and materialization timestamps.
    - Enforce a hard safety cap of 1000 nodes on requested limits.
    - Verify materialization version consistency (D-03).
    - Coordinate windowed node and edge retrieval from the repository.
- **Metadata Assembly:** Implemented logic to calculate:
    - `hasBefore` (offset > 0) and `hasAfter` (from repository probing).
    - `nextCursor` and `previousCursor` (offset ± limit).
    - `totalNodeCount` (from trace summary).
    - `fromFlowOrder` and `toFlowOrder` (from actual nodes returned in the window).

### Verification Results
- **Unit Tests:**
    - `LogReadRepoClickHouse.test.ts`: Verified `loadTraceSummary` implementation (pass).
    - `LogServiceImpl.test.ts`: Expanded with 4 new test cases covering first-page defaults, forward/backward paging metadata, stale cursor conflicts (409), and malformed cursor handling (pass).
- **Type Checking:** `bun x tsc --noEmit` verified for `hono-server`.

## Key Technical Decisions
- **LogServiceImpl as Orchestrator:** Centralized all paging logic and metadata assembly in the service layer, keeping the `LogGraphProjector` focused on graph transformation.
- **Strict Versioning:** Enforced `409 Conflict` when paging across different materialization runs to ensure graph consistency and prevent UI artifacts.
- **Actual Node Bounds:** Chose to use the `flowOrder` of the first and last nodes in the returned set for `fromFlowOrder` and `toFlowOrder`, providing precise feedback to the UI.

## Next Steps
- **Phase 3:** Align the frontend Hono routes and React Flow components with the new paging capabilities.

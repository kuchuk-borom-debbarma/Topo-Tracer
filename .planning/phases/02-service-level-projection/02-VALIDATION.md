# Phase 2: Service-Level Projection - Validation

**Phase Goal:** Service-Level Projection (Metadata calculation and cursor transformation).
**Status:** PENDING

## Requirements Verification

| REQ-ID | Requirement | Verification Method | Status |
|--------|-------------|---------------------|--------|
| FR1 | Fetch subset of nodes based on offset/limit | `LogServiceImpl.test.ts` | PENDING |
| FR2 | Metadata contains flags and cursors | `LogServiceImpl.test.ts` | PENDING |
| TR2 | Limit + 1 probing for hasAfter | `LogServiceImpl.test.ts` | PENDING |
| D-03 | 409 Conflict on stale cursor | `LogServiceImpl.test.ts` | PENDING |
| D-16 | Backward navigation calculation | `LogServiceImpl.test.ts` | PENDING |

## Automated Checks

- **Type Safety:** Run `bun x tsc --noEmit` to ensure `LogServiceImpl` and its tests are correctly typed.
- **Unit/Integration Tests:**
    - `bun test hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts`: 
        - Verify `projectTraceGraph` correctly uses `loadTraceSummary` for version checking.
        - Verify `ConflictError` is thrown on materialization mismatch.
        - Verify `nextCursor` and `previousCursor` generation matches expected offsets.
        - Verify `fromFlowOrder` and `toFlowOrder` reflect actual node data.

## Manual Verification (None Required)
- This phase focuses on the internal service logic. Full E2E verification with the UI belongs in Phase 3.

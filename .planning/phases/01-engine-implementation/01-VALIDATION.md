# Phase 1: Engine Implementation - Validation

**Phase Goal:** Implement and verify the causal clock-skew auto-correction engine.
**Status:** PENDING

## Requirements Verification

| REQ-ID | Requirement | Verification Method | Status |
|--------|-------------|---------------------|--------|
| FR1 | Detect Causal Violation | `TraceReadModelMaterializer.clockSkew.test.ts` | PENDING |
| FR2 | Auto-Correct Timestamps | `TraceReadModelMaterializer.clockSkew.test.ts` | PENDING |
| FR3 | Cascading Correction | `TraceReadModelMaterializer.clockSkew.test.ts` | PENDING |
| FR4 | Preserve Durations | `TraceReadModelMaterializer.clockSkew.test.ts` | PENDING |
| FR5 | Diagnostic Increment | `TraceReadModelMaterializer.clockSkew.test.ts` | PENDING |
| TR1 | Topological Processing | `TraceReadModelMaterializer.clockSkew.test.ts` | PENDING |
| TR3 | Read-Model Focus | `bun test` and ClickHouse schema review | PENDING |

## Automated Checks

- **Type Safety:** Run `bun x tsc --noEmit` to ensure type consistency after schema updates.
- **Unit Tests:**
    - `bun test hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.clockSkew.test.ts`: Verify all correction logic.
    - `bun test hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`: Verify persistence of new fields.

## Manual Verification
- Review generated Read Model JSON for a known clock-skew trace to ensure `originalStartedAt` and `clockSkewMs` are populated and `startedAt` is shifted.

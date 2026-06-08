# Phase 1: API & Repository Foundation - Validation

**Phase Goal:** Update API Types, Repository Contract, and ClickHouse implementation.
**Status:** PENDING

## Requirements Verification

| REQ-ID | Requirement | Verification Method | Status |
|--------|-------------|---------------------|--------|
| REQ-01 | Update `types.ts` with paging structures | `bun x tsc --noEmit` | PENDING |
| REQ-02 | Update `ILogReadRepo` contract | `bun x tsc --noEmit` | PENDING |
| REQ-03 | Implement ClickHouse paging logic | `bun test LogReadRepoClickHouse.test.ts` | PENDING |
| REQ-04 | Implement Cursor codec | `bun test CursorCodec.test.ts` | PENDING |

## Automated Checks

- **Type Safety:** Run `bun x tsc --noEmit --project hono-server/tsconfig.json` to ensure no regressions in the API or Repository layers.
- **Unit Tests:**
    - `bun test hono-server/src/services/log/util/CursorCodec.test.ts`: Verify Base64 encoding/decoding and version validation.
    - `bun test hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`: Verify SQL correctness, offset/limit handling, and total count reporting.

## Manual Verification (None Required)
- This phase is purely foundational (API/Repo/Types); manual E2E verification belongs in Phase 2 (Service Layer Integration).

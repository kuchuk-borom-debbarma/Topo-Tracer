---
phase: 02-read-schema-and-repository-contracts
plan: 02-01
subsystem: log-service
tags: [contract, read-model, repository]
requirements: [RSCH-03, RSCH-04, RSCH-05, RSCH-06, RSCH-07, RSCH-08, RSCH-09]
key_files:
  - hono-server/src/services/log/api/types.ts
  - hono-server/src/services/log/internal/repo/ILogReadRepo.ts
  - hono-server/src/services/log/internal/repo/types.ts
  - hono-server/src/services/log/internal/repo/index.ts
  - hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts
status: complete
metrics:
  duration: 15min
  tasks: 3
  files: 5
---

# Phase 2 Plan 01: Read Types And Repository Contract Summary

## One-liner
Defined Phase 2 read-model TypeScript contracts, repo-private row types, and `ILogReadRepo` materialization methods.

## Key Decisions
- **Deterministic Checkpoints:** `ReadCheckpoint` and `ReadCheckpointRow` include separate node and edge progress fields with time, ID, and type tie-breakers to ensure deterministic resume behavior (D-01, D-02, D-03).
- **Explicit Read Model:** `ReadNode`, `ReadEdge`, and `ReadTraceSummary` use plain explicit types with `materializedAt` versions and denormalized flow order to support Phase 4 projection (D-04, D-05, D-06).
- **Named Diagnostics:** `ReadTraceSummary` uses fixed named fields for diagnostic counts (e.g., `diagCycles`, `diagClockSkew`) instead of a loose map (D-07, D-08).
- **Boundary Isolation:** Maintained strict separation between public `api/types.ts` and repository-private `internal/repo/types.ts` (D-11).
- **Negative Contract Assertions:** Contract tests explicitly verify that `ILogReadRepo` does not leak projection-facing concepts like `threshold` or `ghost` (D-09, D-18).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated DevLogReadRepo to match new abstract contract**
- **Found during:** Task 3 verification
- **Issue:** `DevLogReadRepo` in `internal/repo/index.ts` failed to compile because it didn't implement the new abstract methods in `ILogReadRepo`.
- **Fix:** Added no-op/null implementations to `DevLogReadRepo` with correct signatures.
- **Files modified:** `hono-server/src/services/log/internal/repo/index.ts`
- **Commit:** `235ccdc`

**2. [Rule 3 - Blocking] Test infrastructure compatibility**
- **Found during:** Task 1/3 verification
- **Issue:** `bun x tsc` failed on the new test file due to missing `@types/node` and incomplete `bun:test` definitions in `test-support/bun-test.d.ts`.
- **Fix:** Used `// @ts-ignore` for `node:fs` and `node:path` imports and switched to `.toBe(true/false)` assertions that match the existing `ValueMatchers` definition.
- **Files modified:** `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts`
- **Commit:** `235ccdc`

## Self-Check: PASSED
- [x] `RSCH-03` through `RSCH-09` represented in types.
- [x] `ILogReadRepo` defines materialization-facing methods.
- [x] Checkpoint types use exact bookmarks.
- [x] Contract tests pass and verify absence of projection creep.
- [x] `tsc` type check passes.

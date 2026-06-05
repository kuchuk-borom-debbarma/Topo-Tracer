---
phase: 04
slug: bounded-projection-data-access
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 04 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test |
| **Config file** | `hono-server/tsconfig.json` |
| **Quick run command** | `cd hono-server && bun test src/services/log/internal/repo/ILogReadRepo.test.ts src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` |
| **Full suite command** | `cd hono-server && bun test && bun run fallow` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd hono-server && bun test src/services/log/internal/repo/ILogReadRepo.test.ts src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- **After every plan wave:** Run `cd hono-server && bun test`
- **Before `$gsd-verify-work`:** Run `cd hono-server && bun test && bun run fallow`
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SAFE-01, SAFE-02, SAFE-04 | T-04-CONTRACT | Repository contract requires `userId` and `traceId` and exposes cap metadata | unit/static | `cd hono-server && bun test src/services/log/internal/repo/ILogReadRepo.test.ts` | yes | pending |
| 04-02-01 | 02 | 2 | SAFE-01, SAFE-03, SAFE-04 | T-04-NODES | Visible-node reads are trace-scoped, threshold-filtered, and `LIMIT cap + 1` bounded | fake-client unit | `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | yes | pending |
| 04-03-01 | 03 | 3 | SAFE-02, SAFE-03, SAFE-04 | T-04-EDGES | Edge reads are trace-scoped, visible-node-filtered, and `LIMIT cap + 1` bounded | fake-client unit | `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | yes | pending |
| 04-03-02 | 03 | 3 | SAFE-03 | T-04-FULL | Production projection methods do not call full-trace `loadLatestReadModel` | source assertion | `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | yes | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 30 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending


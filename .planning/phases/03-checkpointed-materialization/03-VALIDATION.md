---
phase: 03
slug: checkpointed-materialization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner (`bun:test`) |
| **Config file** | none — existing Hono tests run directly through Bun |
| **Quick run command** | `cd hono-server && bun test src/services/log/internal/materialization/flowOrder.test.ts src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts src/services/log/internal/worker/ReadOptimisedAggregator.test.ts src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` |
| **Full suite command** | `cd hono-server && bun test` |
| **Estimated runtime** | ~10 seconds for targeted tests; ~30 seconds for full Hono test suite |

---

## Sampling Rate

- **After every task commit:** Run the targeted Bun tests for files touched by the task.
- **After every plan wave:** Run `cd hono-server && bun test`.
- **Before `$gsd-verify-work`:** Run `cd hono-server && bun test` and `cd hono-server && bun run fallow`.
- **Max feedback latency:** 30 seconds for the full Hono test suite on local development hardware.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | MAT-03 | T-03-01 | Repository reads stay scoped by `userId` and `traceId` | unit/fake client | `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | ✅ existing, needs new cases | ⬜ pending |
| 03-01-02 | 01 | 1 | MAT-02, MAT-04, MAT-06, MAT-07, MAT-08, MAT-09 | T-03-02 / T-03-03 | Materializer uses repo contracts, diagnoses malformed graph data, and saves checkpoint last | unit/fake repo | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | MAT-05 | T-03-03 | Malformed graph input cannot block stable `flowOrder` for the entire trace | unit | `cd hono-server && bun test src/services/log/internal/materialization/flowOrder.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | MAT-01, MAT-08 | T-03-02 | Duplicate event-bus delivery delegates idempotent trace materialization without raw payload logging | unit/fake bus | `cd hono-server && bun test src/services/log/internal/worker/ReadOptimisedAggregator.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | MAT-01 through MAT-09 | T-03-01 / T-03-02 / T-03-03 | Integrated source assertions confirm no direct ClickHouse access from worker/materializer and docs explain the flow | source/docs | `cd hono-server && bun test && bun run fallow` | ✅ command available | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` — stubs and fixtures for MAT-02, MAT-04, MAT-06, MAT-07, MAT-08, and MAT-09.
- [ ] `hono-server/src/services/log/internal/materialization/flowOrder.test.ts` — branch, disconnected-node, cycle, self-edge, and orphan-edge cases for MAT-05.
- [ ] `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts` — delegation and trace coalescing coverage for MAT-01.
- [ ] `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` — extend existing fake-client tests for checkpoint/latest/raw-after-checkpoint query construction and row mapping.
- [ ] Schema/type/mapper assertion for `read_nodes.scope` mismatch discovered during research.

---

## Manual-Only Verifications

All Phase 3 behaviors have automated verification. Human review should focus on whether `03-TECHNICAL.md` explains checkpoint loading, raw ordering, merge behavior, diagnostics, retry behavior, and worker delegation clearly enough for future maintenance.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

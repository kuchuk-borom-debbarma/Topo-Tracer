---
phase: 02
slug: read-schema-and-repository-contracts
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-05
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test with local `bun:test` ambient declarations |
| **Config file** | `hono-server/tsconfig.json` |
| **Quick run command** | `cd hono-server && bun test` |
| **Full suite command** | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd hono-server && bun test`
- **After every plan wave:** Run `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | RSCH-03, RSCH-04, RSCH-05, RSCH-06, RSCH-07, RSCH-08, RSCH-09 | T-02-TYPE / T-02-SCOPE | Plain read-model and checkpoint contracts exist without projection or route creep. | unit/static | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json` | W0 | green |
| 02-02-01 | 02 | 2 | RSCH-03, RSCH-04, RSCH-05, RSCH-06, RSCH-07, RSCH-08 | T-02-SCHEMA / T-02-DOCS | Commented ClickHouse DDL defines read nodes, read edges, summaries, and exact checkpoints. | unit/static | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json` | W0 | green |
| 02-03-01 | 03 | 3 | RSCH-03, RSCH-05, RSCH-07, RSCH-08, RSCH-09 | T-02-REPO / T-02-ORDER | Read repository skeleton maps typed rows to ClickHouse inserts and stays contract-bound. | unit | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow` | W0 | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] Schema tests or source assertions that every new read-table column has a ClickHouse `COMMENT`.
- [x] Contract tests or static assertions that `ILogReadRepo` exposes materialization-facing methods and no projection threshold/window methods.
- [x] Repository mapping tests using a fake ClickHouse client for read nodes, read edges, summaries, and checkpoints.

---

## Manual-Only Verifications

All phase behaviors have automated or static verification. Live ClickHouse DDL
smoke is optional and should be recorded as skipped if ClickHouse is unavailable
at `http://localhost:8123`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-05

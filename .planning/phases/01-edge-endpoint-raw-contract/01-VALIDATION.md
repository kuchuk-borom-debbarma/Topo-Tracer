---
phase: 01
slug: edge-endpoint-raw-contract
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-04
---

# Phase 01 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun built-in test runner |
| **Config file** | none - Wave 0 creates focused test files |
| **Quick run command** | `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` |
| **Full suite command** | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow` |
| **Estimated runtime** | ~30 seconds without live ClickHouse smoke; live ClickHouse smoke depends on local service startup |

---

## Sampling Rate

- **After every task commit:** Run the changed focused `bun test` file plus `cd hono-server && bun x tsc --noEmit --project tsconfig.json`.
- **After every plan wave:** Run `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow`.
- **Before `$gsd-verify-work`:** Full suite must be green, and ClickHouse DDL/insert smoke must be run when ClickHouse is available.
- **Max feedback latency:** 60 seconds for automated local checks, excluding manual ClickHouse startup.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-W0-01 | TBD | 0 | RSCH-01 | T-01 | Malformed edge starts do not persist or publish work. | unit | `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts` | no, W0 | pending |
| 01-W0-02 | TBD | 0 | RSCH-01 | T-02 | Self-edges with non-empty endpoints are accepted without endpoint existence checks. | unit | `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts` | no, W0 | pending |
| 01-W0-03 | TBD | 0 | RSCH-02 | T-03 | Edge start insert rows include explicit endpoint columns and do not rely on `data` for graph shape. | unit with fake client | `cd hono-server && bun test ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` | no, W0 | pending |
| 01-W0-04 | TBD | 0 | RSCH-02 | T-04 | Edge end rows stay lifecycle-only and do not invent endpoint values absent from end input. | unit with fake client | `cd hono-server && bun test ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` | no, W0 | pending |
| 01-INT-01 | TBD | final | RSCH-02 | T-05 | Updated ClickHouse DDL creates raw tables with explicit endpoint and lifecycle columns. | integration smoke | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow` plus live ClickHouse DDL smoke when available | manual env | pending |

---

## Threat References

| Ref | Threat | Required Mitigation |
|-----|--------|---------------------|
| T-01 | Malformed edge start creates an unusable graph edge. | Reject missing or blank `fromNodeId` and `toNodeId` before repository persistence and event publish. |
| T-02 | Ingest layer rejects valid out-of-order graph facts. | Allow self-edges and unknown endpoint ids; defer endpoint existence diagnostics to later read materialization. |
| T-03 | Graph projection later reads endpoint-like values from untrusted `data`. | Persist `from_node_id` and `to_node_id` as explicit ClickHouse columns on edge start rows. |
| T-04 | End rows pretend to know start-only endpoint metadata. | Keep edge end input lifecycle-only and map absent endpoint fields to null or an equivalent storage-safe empty state. |
| T-05 | DDL compiles in TypeScript but fails in live ClickHouse. | Smoke test the final raw table DDL against a running ClickHouse instance when available. |

---

## Wave 0 Requirements

- [ ] `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` - validates endpoint rejection, self-edge acceptance, and no publish after repository failure.
- [ ] `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` - validates JSONEachRow values for edge endpoints, edge data, and lifecycle timestamp columns.
- [ ] Fake ClickHouse client injection or Bun module mocking - captures repository insert payloads without requiring a live ClickHouse server.
- [ ] Optional `hono-server/package.json` `test` script - only if the executor needs stable command ergonomics; direct `bun test` is acceptable.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ClickHouse raw DDL smoke | RSCH-02 | ClickHouse was unavailable during research, and nullable lifecycle columns must be verified against the real engine. | Start ClickHouse at `http://localhost:8123`, run the Hono schema initialization path or an equivalent create/drop smoke for `node_events` and `edge_events`, and record the command/output in the phase summary. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify commands or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification.
- [ ] Wave 0 covers all missing test references.
- [ ] No watch-mode flags in verification commands.
- [ ] Feedback latency < 60 seconds for automated checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending

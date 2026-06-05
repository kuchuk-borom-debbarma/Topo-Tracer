---
phase: 06
phase_slug: verification-and-safe-observability
status: planned
created: 2026-06-05
source: 06-RESEARCH.md
---

# Phase 6 Validation Strategy

## Validation Architecture

Phase 6 should be validated with fast Bun tests and source assertions. The
central risks are silent idempotency regressions, accidental expansion of the
materializer into broker-order repair, and unsafe raw payload logging.

## Required Checks

1. Duplicate delivery fixtures prove repeated `log.trace.ingested` work leaves
   latest read state and checkpoints equivalent.
2. Late-event fixtures prove behind-checkpoint data is outside incremental
   materialization, while after-checkpoint timing anomalies diagnose and
   continue.
3. Safe logging tests prove materialization/projection logs include only safe
   ids, counts, thresholds, caps, durations, and diagnostic counts.
4. Source assertions prove log calls do not include raw `nodes`, `edges`,
   `events`, row objects, request bodies, full summaries, or arbitrary `data`
   blobs.
5. Projection audit proves the SAFE-07 matrix is covered by existing projector
   tests, or adds only missing cases.

## Blocking Verification Commands

- `cd hono-server && bun test`
- `cd hono-server && bun run fallow`

## Per-Plan Verification Map

| Plan | Requirement | Test Type | Automated Command |
|------|-------------|-----------|-------------------|
| 06-01 | SAFE-05, SAFE-06 | Bun unit/fixture tests | `cd hono-server && bun test src/services/log/internal/worker/ReadOptimisedAggregator.test.ts src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` |
| 06-02 | SAFE-08 | Bun logger/source assertions | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts src/services/log/internal/service-impl/LogServiceImpl.test.ts` |
| 06-03 | SAFE-07, SAFE-05, SAFE-06, SAFE-08 | Audit/docs/full suite | `cd hono-server && bun test && bun run fallow` |

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Existing Bun infrastructure covers all phase requirements.
- [x] No watch-mode flags.
- [x] Feedback latency target: under 30 seconds for focused tests.

**Approval:** planned 2026-06-05

---
phase: 03-checkpointed-materialization
plan: 03
subsystem: log
tags: [worker, materialization, documentation]
dependency_graph:
  requires: [03-02]
  provides: [MAT-01, MAT-02, MAT-03, MAT-04, MAT-05, MAT-06, MAT-07, MAT-08, MAT-09]
  affects: [hono-server]
tech_stack: [Hono, ClickHouse, Bun]
key_files:
  - hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts
  - hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts
  - .planning/phases/03-checkpointed-materialization/03-TECHNICAL.md
decisions:
  - "Worker Delegation: ReadOptimisedAggregator now accepts ITraceReadModelMaterializer to delegate trace rebuilds, keeping it focused on event-bus adaptation."
  - "Checkpoint Determinism: Documented D-04 caveat regarding raw table sort keys while maintaining deterministic resume via (time, id, type) tuples."
  - "Security Boundaries: Enforced no direct DB/ClickHouse access in worker and no leaking of deferred scope (projections, ghosts, HTTP routes) into Phase 3."
metrics:
  duration: 25min
  completed_date: "2026-06-04"
---

# Phase 3 Plan 03: Wire the worker to the materializer and document Phase 3 behavior Summary

Completed the checkpointed materialization pipeline by wiring the event-bus worker to the materializer and providing comprehensive technical documentation.

## Key Changes

### Worker Delegation
- Updated `ReadOptimisedAggregator` to delegate `materializeTrace` calls to `TraceReadModelMaterializer`.
- Implemented batch coalescing to ensure multiple ingest events for the same trace result in a single materialization call.
- Added strict payload validation for `userId` and `traceId`.

### Technical Documentation
- Created `03-TECHNICAL.md` covering the full materialization lifecycle.
- Documented repository inputs, checkpoint loading, raw event ordering, incremental merge, flow order, diagnostics, and retry semantics.
- Explicitly defined security boundaries and deferred scope to prevent architectural drift.

### Verification and Safety
- Added comprehensive tests for `ReadOptimisedAggregator` covering coalescing, invalid payloads, and insertion order.
- Implemented source-boundary assertions to verify that no direct ClickHouse client imports or deferred scope keywords (e.g., "projection", "ghost") leaked into Phase 3 files.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

1. **Check created files exist:**
   - [x] `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts`
   - [x] `.planning/phases/03-checkpointed-materialization/03-TECHNICAL.md`
2. **Check commits exist:**
   - [x] `45f2ecd`: feat(03-03): delegate ReadOptimisedAggregator trace rebuilds
   - [x] `85ba1db`: docs(03-03): document Phase 3 materialization flow and final safety gates

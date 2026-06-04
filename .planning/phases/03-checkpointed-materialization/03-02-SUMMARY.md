---
phase: 03-checkpointed-materialization
plan: 02
subsystem: log-service
tags: [materialization, flow-order, checkpoint]
requirements: [MAT-02, MAT-03, MAT-04, MAT-05, MAT-06, MAT-07, MAT-08, MAT-09]
key_files:
  - hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts
  - hono-server/src/services/log/internal/materialization/flowOrder.ts
  - hono-server/src/services/log/internal/materialization/flowOrder.test.ts
  - hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts
status: complete
metrics:
  duration: 30min
  tasks: 2
  files: 5
---

# Phase 3 Plan 02: Checkpointed Materialization Fold Summary

## One-liner
Implemented `TraceReadModelMaterializer` for incremental read-model updates and `computeFlowOrder` for deterministic topological trace sorting.

## Key Decisions
- **Deterministic Flow Order:** Implemented Kahn-style topological sort using only explicit graph edges. Sibling order is stabilized by `startedAt` and `nodeId` (D-05, D-06, D-07).
- **Resilient Folding:** The materializer diagnoses malformed lifecycle data (missing starts, negative duration) and graph data (orphans, cycles) without failing the whole trace materialization (D-03, D-08, D-10, D-12).
- **Checkpoint-Last Persistence:** The materializer ensures read nodes, edges, and summaries are saved successfully before advancing the source progress bookmark (D-02, D-13, D-15).
- **Atomic-ish Merging:** Latest read state is merged with post-checkpoint raw events at the materializer level, allowing for idempotent rewrites upon retry (MAT-04, MAT-08, D-14).
- **Explicit Diagnostics:** `ReadTraceSummary` now records 7 categories of named diagnostics to provide visibility into trace data quality (MAT-09, D-11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Diagnostic mapping during fold**
- **Found during:** Task 2 implementation
- **Issue:** Node folding logic needed a way to track diagnostics across multiple raw rows and existing state.
- **Fix:** Used local counters and aggregated them into the final `ReadTraceSummary` payload.
- **Files modified:** `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts`

**2. [Rule 3 - Blocking] Nullability in raw events**
- **Found during:** Task 2 verification
- **Issue:** `NodeEventRow` fields can be null in ClickHouse but materializer needs certain values (like `started_at_ms`) for valid nodes.
- **Fix:** Added defensive checks and diagnostic increments for malformed raw rows.
- **Files modified:** `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts`

## Self-Check: PASSED
- [x] Materializer loads checkpoint and latest state before raw rows.
- [x] Materializer folds only repository-returned post-checkpoint raw events.
- [x] `flowOrder` is deterministic and explicit-edge-only.
- [x] Malformed graph and lifecycle data produce named diagnostics.
- [x] Read rows and summaries are saved before checkpoints.
- [x] All tests in `hono-server` pass.

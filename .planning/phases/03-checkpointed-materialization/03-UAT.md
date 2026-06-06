---
status: testing
phase: 03-checkpointed-materialization
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
started: 2026-06-05T22:35:18Z
updated: 2026-06-05T22:35:18Z
---

## Current Test

number: 1
name: Repository Resume Boundaries Are Deterministic
expected: |
  Phase 03 should let materialization load the latest checkpoint, latest read
  state, and only raw node/edge events after the checkpoint. The raw-event
  queries should be scoped by `userId` and `traceId`, use tuple bookmarks with
  event time, id, and event type tie breakers, and load latest read rows with
  grouped version selection instead of relying on `FINAL`.
awaiting: user response

## Tests

### 1. Repository Resume Boundaries Are Deterministic
expected: Phase 03 should let materialization load the latest checkpoint, latest read state, and only raw node/edge events after the checkpoint. The raw-event queries should be scoped by `userId` and `traceId`, use tuple bookmarks with event time, id, and event type tie breakers, and load latest read rows with grouped version selection instead of relying on `FINAL`.
result: [passed]

### 2. Materializer Folds Events And Writes Checkpoint Last
expected: `TraceReadModelMaterializer` should load checkpoint/latest state, merge post-checkpoint raw node and edge events into read nodes, read edges, and trace summary rows, save the read model first, then save the checkpoint only after the read model write succeeds. If checkpoint save fails, a later run should be able to rewrite idempotently from the old checkpoint.
result: [passed]

### 3. Flow Order And Diagnostics Are Deterministic
expected: Flow order should be computed from explicit edges only, with deterministic sibling/disconnected-node ordering. Malformed lifecycle or graph data should increment named diagnostics such as missing starts, missing ends, negative durations, cycles, orphan edges, invalid importance, or clock skew without failing the whole trace.
result: [passed]

### 4. Worker Delegates Materialization Without Scope Creep
expected: `ReadOptimisedAggregator` should validate `log.trace.ingested` payloads, coalesce repeated trace ids in a batch, and delegate to the materializer. The worker should not import ClickHouse clients, add HTTP routes, implement projection/ghost logic, or touch frontend, SDK, or `carno.js` code.
result: [passed]

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps


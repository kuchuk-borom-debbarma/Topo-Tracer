# Phase 6: Verification And Safe Observability - Research

**Researched:** 2026-06-05T21:57:16Z
**Status:** Ready for planning

## Research Complete

Phase 6 should be planned as a hardening pass over existing Hono log internals.
The implementation surface is narrow: tests, safe log fields, source
assertions, and technical/verification documentation. No new route, frontend,
SDK, or `carno.js` work is needed.

## Current Implementation Findings

### Duplicate Delivery And Ordering

- `LogServiceImpl.ingestNodesNEdges` publishes `log.trace.ingested` events with
  `key: traceId` and idempotency ids derived from trace-local payload content.
  This matches the prior decision that trace-local ordering belongs to the
  event bus or broker.
- `IEventBus` documents that implementations translate the contract into
  batching, idempotency, durability, per-key ordering, and coalescing/dedupe.
- `DevEventBus` is intentionally simple. It groups by topic, preserves the
  publisher array order within one in-process batch, and fanouts to handlers
  through `Promise.all`. It does not emulate durable broker dedupe, retry
  windows, or explicit per-key ordering beyond the input array sequence.
- `ReadOptimisedAggregator.run` accepts a batch directly and coalesces repeated
  trace ids in a `Map`, then materializes each retained trace in insertion
  order.
- Existing worker tests cover invalid payloads, same-trace coalescing within a
  listener batch, and distinct-trace order. They do not yet prove an
  end-to-end duplicate-delivery replay leaves latest read state/checkpoint
  equivalent.

### Checkpointed Materialization

- `TraceReadModelMaterializer.materializeTrace` loads checkpoint first, then
  latest read model state, then raw events after checkpoint through
  `ILogReadRepo.loadRawEventsAfterCheckpoint`.
- It returns early without writes if no raw node or edge events are returned.
  This is the natural assertion point for behind-checkpoint late events: the
  repository boundary should not return them, and the materializer does not
  rediscover them.
- It writes read nodes, read edges, and trace summary before saving the
  checkpoint. Existing tests already cover save-read-model-before-checkpoint
  and retry after checkpoint save failure.
- It increments diagnostics for missing starts, missing ends, negative
  durations, invalid importance, clock skew, cycles, and orphan edges. Existing
  tests cover missing starts but should be extended for after-checkpoint timing
  weirdness such as negative duration and clock skew.
- The current checkpoint is built from the last event in the returned
  `nodeEvents` and `edgeEvents` arrays. Tests should avoid implying the
  materializer sorts raw events itself; deterministic ordering belongs to the
  repository/broker boundary established in Phase 3.

### Safe Logging

- `LogServiceImpl.projectTraceGraph` already logs a safe projection summary:
  `userId`, `traceId`, `threshold`, returned counts, visible/ghost counts,
  cap-hit booleans, and omitted edge count. Existing tests assert no raw
  `nodes` or `edges` arrays in that log metadata.
- `TraceReadModelMaterializer` currently logs `logger.info("Materialized trace",
  { nodes, edges, diagnostics: summary })`. This violates the Phase 6 decision
  because `diagnostics` receives a full `ReadTraceSummary` object instead of
  explicit scalar fields or a deliberately shaped diagnostic-count object.
- Repository logs in `LogWriteRepoClickHouse` and `LogReadRepoClickHouse` use
  safe counts and ids only: prepared row counts, read-model row counts, and
  checkpoint ids. They are lower risk than the materializer log.

### Projection Regression Audit

- `LogGraphProjector.test.ts` already covers the SAFE-07 matrix:
  threshold visibility, hidden prefix, hidden suffix, middle hidden range,
  all-hidden traces, visible-hidden-visible snapping, same-ghost hidden edge
  count, cross-ghost hidden edge snapping, duplicate snapped edge aggregation,
  orphan edge omission, and cap metadata propagation.
- Phase 5 summaries state all 11 projection fixtures passed and SAFE-07 is
  marked complete in `.planning/REQUIREMENTS.md`.
- Phase 6 should audit and document this coverage rather than duplicating
  projector fixtures unless the audit finds an actual missing case.

## Recommended Plan Shape

1. **Plan 06-01: Idempotency And Late-Event Contracts**
   - Extend worker/materializer tests around duplicate delivery, checkpoint
     equivalence, behind-checkpoint no-op behavior, and after-checkpoint
     diagnose-and-continue timing behavior.
   - Add source assertions that the dev bus remains explicitly documented as
     non-durable/non-deduping and that materializer tests do not rely on
     materializer-side sorting.

2. **Plan 06-02: Safe Observability Guards**
   - Replace the materializer full-summary log with explicit safe scalar fields
     or a known safe diagnostic-count object.
   - Add logger-fake tests and source assertions that materializer/projection
     logs do not include `nodes`, `edges`, `events`, raw row objects, request
     bodies, full summary objects, or arbitrary `data` blobs.

3. **Plan 06-03: Projection Audit And Closeout Documentation**
   - Audit SAFE-07 coverage against existing `LogGraphProjector.test.ts`.
   - Add no duplicate projector tests if the matrix is fully covered.
   - Write technical documentation for Phase 6 describing the duplicate/late
     contract, safe log shape, and projection audit result.
   - Update requirements/state only after verification passes during execution,
     not during planning.

## Validation Architecture

Phase 6 should be validated with fast Bun tests and source assertions. The main
risks are silent regression of materialization idempotency, accidental expansion
of materializer responsibility into broker ordering repair, and raw payload
leakage through logs.

Required checks:

1. Worker/materializer tests prove duplicate trace-ingest delivery and retry
   leave equivalent read state and checkpoint results.
2. Materializer tests prove behind-checkpoint raw events are ignored when the
   repository returns no post-checkpoint rows.
3. Materializer tests prove after-checkpoint timing weirdness increments
   diagnostics without throwing.
4. Logger tests prove materializer and projection logs contain safe scalar
   summaries and omit raw arrays/full objects.
5. Source assertions prove unsafe log keys and scope-expanding strings are not
   introduced.
6. Projection audit proves SAFE-07 is already covered or adds only actual gap
   tests.

Blocking verification commands:

- `cd hono-server && bun test`
- `cd hono-server && bun run fallow`

## Planning Risks

- Avoid writing tests that require `DevEventBus` to provide production-grade
  dedupe or durability. The dev bus should remain a local in-process adapter.
- Avoid adding sorting/repair responsibilities to `TraceReadModelMaterializer`.
  The materializer consumes ordered post-checkpoint rows from the repository
  contract.
- Avoid creating duplicate projection tests solely because Phase 6 mentions
  SAFE-07. Audit first, add only gaps.
- Avoid logging the full `ReadTraceSummary` object under a renamed key. The
  allowed log shape is explicit scalar fields or a narrow diagnostic-count
  object.

## Research Complete

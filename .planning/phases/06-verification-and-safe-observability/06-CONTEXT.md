# Phase 6: Verification And Safe Observability - Context

**Gathered:** 2026-06-05T21:53:37Z
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase hardens the completed Hono read-model pipeline with focused
verification and safe runtime observability. It should add or adjust tests that
prove duplicate trace-ingest delivery remains idempotent, late or
out-of-order data follows the checkpoint and diagnostic contracts, existing
ghost projection behavior is covered without duplicating tests, and
materialization/projection logs expose only structured safe summaries.

This phase does not add HTTP routes, frontend behavior, SDK behavior, durable
production event bus implementation, new projection features, pagination, or
`carno.js` changes.

</domain>

<decisions>
## Implementation Decisions

### Duplicate And Late Event Contract

- **D-01:** Phase 6 should add end-to-end idempotency coverage for duplicate
  `log.trace.ingested` delivery. The test intent is to prove duplicate delivery
  leaves the materialized latest state and checkpoint equivalent after replay
  or retry.
- **D-02:** Trace-local ordering is the event bus or broker's responsibility.
  The materializer should not compensate for a production broker that delivers
  older trace events after newer trace events for the same trace.
- **D-03:** The development event bus may not fully enforce trace-local
  ordering yet. Phase 6 should keep this gap visible through tests or
  documentation, but should not move ordering repair into materialization.
- **D-04:** The per-trace checkpoint remains authoritative. Raw events older
  than or equal to the saved checkpoint are behind the incremental progress
  boundary and should not be rediscovered by normal materialization.
- **D-05:** Behind-checkpoint late events are ignored by incremental
  materialization. This is the documented deterministic behavior, not a
  materializer bug.
- **D-06:** After-checkpoint lifecycle timing weirdness keeps the Phase 3
  diagnose-and-continue contract. Materialization should merge what it can,
  remain deterministic, increment diagnostics such as clock skew, negative
  duration, or missing lifecycle counts, and not fail the whole trace solely for
  lifecycle ordering issues.
- **D-07:** The main duplicate-delivery fixture should exercise worker plus
  materializer fake-repo-style behavior. Do not broaden this into a fake
  ClickHouse integration suite unless planning finds a concrete gap that cannot
  be covered at the worker/materializer boundary.

### Safe Log Shape

- **D-08:** Materialization and projection logs should use structured safe
  summaries. Useful fields include `userId`, `traceId`, node counts, edge
  counts, selected threshold, read caps, cap-hit status, durations, and
  diagnostic counts.
- **D-09:** Phase 6 should enforce the safe log contract with both logger-fake
  tests where practical and source assertions that prevent accidental raw
  payload logging.
- **D-10:** Raw payload leakage means logging arrays or full objects from
  read/raw rows. Logs must not include `nodes`, `edges`, `events`, raw row
  objects, request bodies, full summary objects, arbitrary `data` blobs, or
  arbitrary metadata objects.
- **D-11:** Diagnostic counts are allowed when they are shaped as explicit
  scalar fields or a known safe diagnostic-count object. Do not log a full
  `ReadTraceSummary` object as a shortcut for diagnostics.
- **D-12:** If the Phase 6 guard finds an unsafe log call, fix it immediately in
  this phase and add the regression guard. Do not merely document the risk.

### Projection Regression Scope

- **D-13:** SAFE-07 is already marked complete from Phase 5, so Phase 6 should
  audit the current projector tests against the required matrix and add only
  missing cases.
- **D-14:** The required projection matrix is visible-hidden-visible chains,
  hidden prefixes, hidden suffixes, all-hidden traces, dense hidden edges, and
  orphan edges.
- **D-15:** If the audit confirms all SAFE-07 cases are already covered, Phase 6
  should add no duplicate projector tests. Record the audit result and spend
  implementation effort on SAFE-05, SAFE-06, and SAFE-08.

### Scope Locks

- **D-16:** Do not change the graph model. Edges remain the only graph links;
  do not infer parentage from ids, ancestry paths, or start order.
- **D-17:** Do not revise Phase 3's checkpoint-last write semantics or
  diagnose-and-continue malformed timing policy.
- **D-18:** Do not revise Phase 5's runtime ghost projection model or add stored
  ghost nodes.

### the agent's Discretion

- The planner may choose the exact test file placement and helper structure
  under `hono-server/src/services/log/internal`, provided tests stay focused
  and follow existing Bun test patterns.
- The planner may decide whether the end-to-end duplicate fixture uses a
  purpose-built fake repository, fake materializer harness, or current
  materializer with fake `ILogReadRepo`, as long as it proves equivalent latest
  state and checkpoint behavior.
- The planner may choose exact logger assertion mechanics, but the guard must
  fail if raw arrays or full read/raw objects are logged.
- The planner may choose whether to capture the SAFE-07 audit in technical docs,
  test names, or a short verification artifact, as long as downstream readers
  can see why no duplicate projection tests were added if all cases are already
  covered.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope And Requirements

- `.planning/PROJECT.md` — Defines Hono-only scope, read-model goals, explicit
  checkpoint requirement, threshold semantics, safety caps, and deferred
  pagination/windowing work.
- `.planning/ROADMAP.md` — Defines Phase 6 goal, dependency on Phase 5, and
  success criteria for duplicate delivery, late/out-of-order behavior, ghost
  regression coverage, and safe observability.
- `.planning/REQUIREMENTS.md` — Defines pending `SAFE-05`, `SAFE-06`, and
  `SAFE-08`, and records `SAFE-07` as complete.
- `.planning/STATE.md` — Records Phase 5 complete and Phase 6 as the remaining
  milestone phase.

### Prior Phase Contracts

- `.planning/phases/03-checkpointed-materialization/03-CONTEXT.md` — Locks
  event-bus ordering responsibility, authoritative checkpoint boundary,
  checkpoint-last writes, deterministic flow order, and diagnose-and-continue
  malformed timing behavior.
- `.planning/phases/04-bounded-projection-data-access/04-CONTEXT.md` — Locks
  bounded projection input reads and cap metadata expectations.
- `.planning/phases/04-bounded-projection-data-access/04-TECHNICAL.md` —
  Documents bounded read methods and repository cap behavior that projection
  logs should summarize safely.
- `.planning/phases/05-ghost-projection-logic/05-CONTEXT.md` — Locks runtime
  ghost projection, range-based ghost ids, edge snapping, aggregation, orphan
  omission, and projection component boundaries.
- `.planning/phases/05-ghost-projection-logic/05-TECHNICAL.md` — Documents the
  implemented projection flow and should be checked during the SAFE-07 audit.

### Hono Architecture Rules

- `hono-server/src/code-base.md` — Mandatory guide for service boundaries,
  repository usage, event bus semantics, safe logging, type placement, and
  Fallow verification.
- `.planning/codebase/STACK.md` — Records Hono, ClickHouse web client, Wrangler,
  Bun, TypeScript, and Fallow tooling context.
- `.planning/codebase/ARCHITECTURE.md` — Records explicit-edge graph model,
  read-model architecture, ClickHouse latest-row style, and anti-patterns.
- `.planning/codebase/TESTING.md` — Useful starting point for test strategy, but
  verify against current Hono tests because the codebase now contains Bun tests.

### Current Hono Log Module

- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` —
  Current listener that validates `log.trace.ingested`, coalesces repeated
  trace ids within a batch, and delegates to materialization.
- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts`
  — Existing worker coverage for invalid payloads, same-trace coalescing, and
  distinct-trace ordering.
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts`
  — Current checkpointed materializer and known SAFE-08 focus area because it
  logs a full summary object as diagnostics.
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts`
  — Existing materializer coverage for load/merge/save behavior and checkpoint
  retry.
- `hono-server/src/services/log/internal/materialization/flowOrder.test.ts` —
  Existing deterministic flow-order and malformed graph behavior coverage.
- `hono-server/src/services/log/internal/projection/LogGraphProjector.test.ts`
  — Existing SAFE-07 projection fixture suite; audit before adding any new
  projection tests.
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` —
  Current projection orchestration and safe projection trace log shape.
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` —
  Existing log service tests; likely integration point for projection log guard
  coverage.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` — Repository
  contract for checkpoint, latest read state, raw events after checkpoint, and
  bounded projection reads.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
  — Existing checkpoint query/save mapping coverage; use only if planning finds
  repository-level coverage necessary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ReadOptimisedAggregator.run` already accepts an event batch directly, which
  can drive duplicate-delivery tests without needing a real event bus.
- `TraceReadModelMaterializer` already accepts a fake `ILogReadRepo` and
  injectable `now`, which can drive deterministic idempotency and checkpoint
  retry fixtures.
- Existing materializer tests already cover checkpoint-save failure followed by
  retry. Phase 6 can build on that instead of starting from scratch.
- `LogGraphProjector.test.ts` already covers threshold visibility, hidden
  prefix, hidden suffix, middle hidden range, all-hidden, visible-hidden-visible
  snapping, same-ghost hidden edge counting, cross-ghost snapping, duplicate
  snapped edge aggregation, orphan edge omission, and cap metadata propagation.

### Established Patterns

- Hono tests use `bun:test`, focused fake implementations, and source assertions
  for contract checks.
- Service and worker code should depend on repository/event-bus contracts rather
  than ClickHouse clients directly.
- Logs should use structured scalar metadata and should not include raw
  telemetry payloads or arbitrary `data` objects.
- Latest read rows and checkpoints are idempotent replacement/version records;
  retrying from the same checkpoint should safely rewrite before advancing the
  checkpoint.

### Integration Points

- Add duplicate-delivery/idempotency coverage around
  `ReadOptimisedAggregator.run` and `TraceReadModelMaterializer` with fake
  repository state.
- Add late/out-of-order coverage around
  `TraceReadModelMaterializer.materializeTrace` and repository
  `loadRawEventsAfterCheckpoint` assumptions.
- Add safe log assertions around `TraceReadModelMaterializer` and
  `LogServiceImpl.projectTraceGraph`.
- Audit `LogGraphProjector.test.ts` against SAFE-07 before adding projection
  fixtures.
- Run the Hono quality gate from `hono-server` after implementation.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly emphasized that the event bus owns ordering, while the
  development event bus may not guarantee it yet. Keep tests precise enough to
  expose that boundary without quietly making the materializer responsible for
  broker semantics.
- The current materializer log call logs `diagnostics: summary`; Phase 6 should
  replace that with explicit scalar diagnostic fields or a deliberately shaped
  safe diagnostic-count object.
- Projection regression work should be evidence-driven: if the existing Phase 5
  suite already covers SAFE-07, do not add ceremonial duplicate tests.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 6-Verification And Safe Observability*
*Context gathered: 2026-06-05T21:53:37Z*

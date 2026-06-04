# Phase 3: Checkpointed Materialization - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds Hono read-model materialization. The
`ReadOptimisedAggregator` should delegate trace work to a materialization
component that loads explicit per-trace checkpoints, reads only later raw node
and edge events, merges those events into existing latest read state, writes
replacement read rows and summaries through `ILogReadRepo`, then advances the
checkpoint only after read writes succeed.

This phase does not add HTTP routes, bounded projection reads, ghost projection
logic, frontend behavior, SDK behavior, durable production event bus work, or
`carno.js` implementation.

</domain>

<decisions>
## Implementation Decisions

### Late Event Policy

- **D-01:** Materialization should rely on the message broker/event bus to
  preserve trace-local delivery order. Phase 3 should not try to compensate for
  a broker that delivers older raw writes after newer raw writes for the same
  trace.
- **D-02:** The checkpoint remains the source-progress boundary. Materialization
  reads raw rows after the stored checkpoint and should not rediscover older raw
  rows behind the checkpoint.
- **D-03:** If a processed event has lifecycle timing that appears earlier than
  related state, materialization should merge it when possible and increment
  named diagnostics such as clock skew, negative duration, or missing lifecycle
  counts instead of failing the whole trace.
- **D-04:** The planner should verify the existing raw ordering fields are
  sufficient for deterministic resume. If raw insertion order is needed beyond
  lifecycle timestamps and ids, call that out clearly before implementation.

### Flow Order Rules

- **D-05:** `flowOrder` is a stable linear projection of the explicit edge graph.
  It is not depth, parentage, a tree path, or a relationship inferred from node
  ids.
- **D-06:** Prefer a deterministic topological ordering built from explicit
  edges. For branching, sibling nodes should be ordered by `startedAt`, then by
  stable node id.
- **D-07:** Disconnected nodes should be appended in deterministic `startedAt`,
  then node id order.
- **D-08:** If cycles or conflicting ordering inputs are present, materialization
  should keep a deterministic fallback order and increment cycle or malformed
  graph diagnostics. It should not block the entire trace just because one part
  of the graph cannot be topologically ordered.
- **D-09:** The flow-order output must be stable enough for later ghost
  projection to produce repeatable hidden flow-order ranges.

### Malformed Graph Diagnostics

- **D-10:** Use "diagnose and continue" as the v1 policy. Materialize valid
  nodes, edges, and summaries; omit or degrade invalid pieces as needed; record
  the issue through named diagnostic counts.
- **D-11:** Missing starts, missing ends, orphan edges, invalid importance,
  negative durations, cycles, and clock skew should remain observable through
  summary diagnostics.
- **D-12:** Unknown edge endpoints should not be validated at ingestion time.
  Phase 3 materialization should diagnose orphan edges because node and edge
  events may arrive in different batches.

### Retry And Partial Write Semantics

- **D-13:** Use idempotent rewrite with checkpoint-last semantics. Save read
  nodes, read edges, and trace summary first; save the checkpoint only after
  those writes succeed.
- **D-14:** If checkpoint saving fails after read rows were written, the next
  retry should safely rewrite replacement/version rows and then attempt the
  checkpoint again. This fits the append-heavy ClickHouse design.
- **D-15:** Never advance a checkpoint before related read rows and summaries are
  persisted.
- **D-16:** Do not introduce transaction-like staging unless the planner finds a
  concrete ClickHouse/runtime issue that the idempotent rewrite approach cannot
  handle.

### Technical Documentation

- **D-17:** Each phase should add technical documentation explaining what was
  built, why it exists, and how it works. This is important because the user
  needs to understand the whole system over time.
- **D-18:** Phase 3 should document the materialization flow in enough detail to
  explain checkpoint loading, raw event ordering, merge behavior, flow-order
  generation, diagnostic handling, write ordering, retry behavior, and worker
  delegation.
- **D-19:** Documentation should be technical and concrete, not just a summary.
  It should reference the relevant Hono files and the data movement through
  repository contracts.

### Scope Locks

- **D-20:** Do not add Hono HTTP routes in this phase. v1 read routes remain out
  of scope.
- **D-21:** Do not add bounded projection repository methods in this phase unless
  they are strictly required to keep materialization contracts coherent. Phase 4
  owns bounded projection data access.
- **D-22:** Do not add ghost projection logic in this phase. Phase 5 owns ghost
  projection behavior.
- **D-23:** Do not touch `carno.js`, frontend, or SDK code for this phase.

### the agent's Discretion

- The planner may choose the exact materialization component name and file split
  as long as `ReadOptimisedAggregator` delegates trace rebuild work rather than
  owning the folding logic inline.
- The planner may choose the precise deterministic topological-sort algorithm,
  provided it uses explicit edges only and has stable tie breakers for branches,
  disconnected nodes, and malformed graphs.
- The planner may decide whether to extend `ILogReadRepo` directly or add a
  companion raw-read method/contract, but services and workers must not access
  ClickHouse directly.
- The planner may decide the exact documentation file names and placement, as
  long as Phase 3 technical behavior is documented for human understanding.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope And Requirements

- `.planning/PROJECT.md` — Defines Hono-only scope, read-model goals,
  checkpoint requirement, threshold semantics, and out-of-scope boundaries.
- `.planning/ROADMAP.md` — Defines Phase 3 goal, dependency on Phase 2, and
  success criteria.
- `.planning/REQUIREMENTS.md` — Defines Phase 3 requirements `MAT-01` through
  `MAT-09` and related safety requirements `SAFE-05` and `SAFE-06`.
- `.planning/STATE.md` — Records Phase 2 completion and Phase 3 as the current
  focus.

### Prior Phase Contracts

- `.planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md` — Locks edge
  endpoint, lifecycle timestamp, and orphan-endpoint diagnostic expectations.
- `.planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md` —
  Locks exact checkpoint bookmarks, versioned replacement rows, named
  diagnostics, and `ILogReadRepo` as the materialization repository boundary.
- `.planning/phases/02-read-schema-and-repository-contracts/02-03-SUMMARY.md` —
  Confirms Phase 2 repository factory wiring and ClickHouse read-repo skeleton
  are complete.

### Hono Architecture Rules

- `hono-server/src/code-base.md` — Mandatory guide for Hono service boundaries,
  repository usage, event bus semantics, safe logging, type placement, and
  Fallow verification.
- `.planning/codebase/STACK.md` — Records Hono, ClickHouse web client,
  Wrangler, Bun, TypeScript, and Fallow tooling context.
- `.planning/codebase/ARCHITECTURE.md` — Records read-model architecture,
  graph-model constraints, explicit edge model, and anti-patterns.
- `.planning/codebase/INTEGRATIONS.md` — Records ClickHouse, Hono runtime,
  event bus, logging, and environment integration constraints.

### Current Hono Log Module

- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` —
  Current event-bus listener and trace coalescing scaffold that should delegate
  materialization work.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` — Read-model
  repository contract for checkpoint loading, latest read model loading, read
  model saving, and checkpoint saving.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` —
  Current ClickHouse read-repo skeleton with save mappings and Phase 3
  load-method placeholders.
- `hono-server/src/services/log/internal/repo/types.ts` — Raw event row types
  and read-model row shapes used by repository implementations.
- `hono-server/src/services/log/api/types.ts` — Public read-model types,
  checkpoint type, and diagnostic fields.
- `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` —
  Existing raw row mapping and lifecycle timestamp shape that materialization
  reads from.
- `hono-server/src/infra/db/clickhouse/schema.ts` — Raw and read-optimized
  ClickHouse DDL, including replacement rows and checkpoint tables.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` — Existing
  contract assertion tests for read-model repository shape.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
  — Existing fake-client tests for save mappings and checkpoint insert shape.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ReadOptimisedAggregator` already subscribes to `log.trace.ingested`,
  validates payload shape, coalesces repeated trace events inside one listener
  batch, and calls a trace-level `rebuildTrace` stub.
- `ILogReadRepo` already exposes `loadCheckpoint`, `loadLatestReadModel`,
  `saveReadModel`, and `saveCheckpoint`.
- `LogReadRepoClickHouse` already maps read nodes, read edges, summaries, and
  checkpoints into ClickHouse insert rows, but checkpoint and latest-state load
  methods still throw Phase 3 placeholders.
- `LogWriteRepoClickHouse` already maps raw node and edge lifecycle events into
  explicit start/end timestamp columns and explicit edge endpoint columns.
- `CLICKHOUSE_SCHEMA_STATEMENTS` already includes read nodes, read edges, trace
  summaries, and materialization checkpoints.

### Established Patterns

- Hono services and workers should depend on repository contracts rather than
  ClickHouse clients.
- Repository implementations may depend on ClickHouse infrastructure and should
  use constructor-injected client providers for fake-client tests.
- Worker logs should use safe ids and counts, not raw event payloads.
- Hono TypeScript uses plain explicit types, relative imports, two-space
  indentation, double quotes, and semicolons.
- After source changes in `hono-server`, the required quality gate is
  `bun run fallow` from `hono-server`.

### Integration Points

- `ReadOptimisedAggregator.rebuildTrace` should become the delegation point to a
  materialization component.
- Phase 3 likely needs repository support to read raw node and edge events after
  checkpoint bookmarks in deterministic order. The planner should decide whether
  that belongs in `ILogReadRepo`, a separate raw-read repository method, or a
  narrower materialization-facing contract.
- `LogReadRepoClickHouse.loadCheckpoint` and `loadLatestReadModel` must stop
  throwing and should use grouped latest-version reads consistent with Phase 2's
  versioned replacement-row design.
- Existing tests are Bun tests. Phase 3 should add focused tests around
  idempotent duplicate delivery, checkpoint-last behavior, deterministic
  ordering, and diagnostic continuation.

</code_context>

<specifics>
## Specific Ideas

- The user expects the message broker to preserve ordering for trace-local
  events; materialization should not own broker-order repair.
- The user asked specifically how flow order behaves when one node has two
  children. The locked answer is deterministic sibling ordering under a stable
  graph-derived linear order.
- The user approved "diagnose and continue" for malformed graph handling.
- The user approved idempotent rewrite with checkpoint-last semantics for retry
  and partial write behavior.
- The user wants technical documentation added for every phase so they can
  understand how the whole system works.

</specifics>

<deferred>
## Deferred Ideas

- Broker durability, retries, and per-key ordering guarantees beyond the
  development event bus are deferred to production infrastructure work.
- Bounded projection reads are deferred to Phase 4.
- Ghost projection logic is deferred to Phase 5.
- HTTP read routes are deferred outside v1.

</deferred>

---

*Phase: 3-Checkpointed Materialization*
*Context gathered: 2026-06-05*

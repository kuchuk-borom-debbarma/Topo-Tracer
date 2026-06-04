# Phase 2: Read Schema And Repository Contracts - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase defines the Hono read-side foundation: ClickHouse table DDL,
plain TypeScript read-model types, and repository contracts for latest nodes,
latest edges, trace summaries, and materialization checkpoints. It prepares
Phase 3 materialization to write and read these structures, but does not build
materialization logic, projection logic, HTTP routes, frontend behavior, or
`carno.js` code.

</domain>

<decisions>
## Implementation Decisions

### Checkpoint Progress Shape

- **D-01:** Materialization checkpoints must act like exact bookmarks, not just
  simple time bookmarks. A checkpoint should remember enough raw-source
  progress to resume at the exact next raw event even when events share the same
  timestamp.
- **D-02:** Checkpoint rows must remain separate from latest read node and read
  edge rows. Later materialization must not infer raw event progress from latest
  read state.
- **D-03:** The planner should design checkpoint fields around deterministic
  ordering and tie breakers for both raw node and raw edge streams. Exact field
  names are planner discretion, but the contract must be explicit and testable.

### Latest State Storage

- **D-04:** Latest node, edge, and summary state should be stored as
  history-friendly replacement/version rows, using a version field such as
  `materialized_at_ms`.
- **D-05:** The read model should fit ClickHouse append-heavy behavior. Avoid
  in-place update semantics and avoid relying on mutable row replacement as the
  conceptual contract.
- **D-06:** Read queries in later phases should be able to select latest state
  through grouped version selection, consistent with the existing project
  preference for `argMax(..., materialized_at_ms)` style reads over `FINAL`.

### Diagnostics Shape

- **D-07:** Trace summary diagnostics should use named diagnostic count columns,
  not a loose diagnostics map. Important examples include orphan edges, missing
  starts, missing ends, invalid importance values, negative durations, cycles,
  and clock skew.
- **D-08:** The exact diagnostic column set is planner discretion, but it must
  cover the known malformed graph/materialization cases from requirements and
  prior project docs well enough for Phase 3 and Phase 6 tests to target fixed
  fields.

### Repository Boundary Depth

- **D-09:** Phase 2 should define schema, types, and repository contracts needed
  by Phase 3 materialization only. Projection-specific read/query methods should
  be left for Phase 4 unless a minimal type is required to keep the contract
  coherent.
- **D-10:** `ILogReadRepo` should become the primary read-model repository
  contract for materialization. It should cover checkpoint access and writes for
  read nodes, read edges, and trace summaries.
- **D-11:** Services and workers must depend on repository contracts, not direct
  ClickHouse clients, matching `hono-server/src/code-base.md`.

### Scope Locks

- **D-12:** Do not add Hono HTTP routes in this phase. v1 read routes remain out
  of scope.
- **D-13:** Do not implement read-model materialization in this phase. The phase
  may create repository contracts and ClickHouse DDL needed by materialization,
  but Phase 3 owns the folding/rebuild behavior.
- **D-14:** Do not add graph projection or ghost-node logic in this phase. Phase
  4 and Phase 5 own bounded projection reads and ghost projection behavior.
- **D-15:** Do not touch `carno.js`, frontend, or SDK code for this phase.

### the agent's Discretion

- The planner may choose exact table names, file split, and field order, as long
  as names are clear, ClickHouse-friendly, and scoped to `hono-server`.
- The planner may decide whether checkpoint progress is stored in one row with
  node/edge progress columns or in separate rows per raw source stream, provided
  the resulting bookmark is exact and per `userId` + `traceId`.
- The planner may decide whether table DDL uses `ReplacingMergeTree` or another
  ClickHouse engine appropriate for versioned read-model rows, but it must
  justify the choice in the plan and keep Phase 2 development-schema only.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope And Requirements

- `.planning/PROJECT.md` — Defines Hono-only read-model goal, constraints,
  threshold semantics, safety requirements, and checkpoint requirement.
- `.planning/ROADMAP.md` — Defines Phase 2 goal, dependency on Phase 1, and
  success criteria.
- `.planning/REQUIREMENTS.md` — Defines Phase 2 requirements `RSCH-03` through
  `RSCH-09` and v1/v2 scope boundaries.
- `.planning/STATE.md` — Records Phase 1 completion and Phase 2 as the current
  focus.

### Prior Phase Contracts

- `.planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md` — Locks raw
  edge endpoint, lifecycle, and schema decisions Phase 2 builds on.
- `.planning/phases/01-edge-endpoint-raw-contract/01-VERIFICATION.md` —
  Confirms Phase 1 shipped explicit `fromNodeId`/`toNodeId` ingest and raw
  `from_node_id`/`to_node_id` persistence.

### Hono Architecture Rules

- `hono-server/src/code-base.md` — Mandatory service/repository/type placement
  guide for Hono implementation.
- `.planning/codebase/STACK.md` — Records Hono, ClickHouse web client, Bun,
  TypeScript, Wrangler, and Fallow tooling context.
- `.planning/codebase/ARCHITECTURE.md` — Records read-model architecture,
  service/repository boundaries, and graph-model anti-patterns.
- `.planning/codebase/INTEGRATIONS.md` — Records ClickHouse configuration,
  Hono runtime, and integration constraints.

### Current Hono Log Module

- `hono-server/src/services/log/api/types.ts` — Public log service types,
  including Phase 1 edge endpoint fields.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` — Current empty
  read repository contract to flesh out in Phase 2.
- `hono-server/src/services/log/internal/repo/ILogWriteRepo.ts` — Existing write
  repository boundary for raw ingestion.
- `hono-server/src/services/log/internal/repo/types.ts` — Current repo-private
  raw row types; Phase 2 may add read-row types here or adjacent internal type
  files.
- `hono-server/src/services/log/internal/repo/index.ts` — Current repository
  wiring with placeholder `DevLogReadRepo`.
- `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` —
  Existing ClickHouse repository style and testable client-provider pattern.
- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` —
  Current worker scaffold that will later consume the read repository contract.
- `hono-server/src/infra/db/clickhouse/schema.ts` — Current raw ClickHouse DDL;
  Phase 2 should extend development DDL with read tables.
- `hono-server/src/infra/db/clickhouse/clickhouse.ts` — ClickHouse singleton and
  initialized-client access pattern repositories should use.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ILogReadRepo` already exists as an empty abstract class; Phase 2 should turn
  it into a real repository contract instead of inventing a second read
  repository surface.
- `DevLogReadRepo` currently exists only as a placeholder in
  `internal/repo/index.ts`; Phase 2 can replace it with a ClickHouse
  implementation factory when DDL and contracts are ready.
- `LogWriteRepoClickHouse` already demonstrates the local pattern for
  constructor-injected ClickHouse client providers in tests while preserving the
  production default of `getInitializedClickHouseClient()`.
- `CLICKHOUSE_SCHEMA_STATEMENTS` is the existing schema registration list;
  Phase 2 read DDL constants should be included there if they are part of
  development initialization.

### Established Patterns

- Public service types belong under `services/log/api`.
- Repository contracts and row shapes belong under `services/log/internal/repo`.
- Repository implementations may import ClickHouse infrastructure; services and
  workers should not.
- Hono code uses plain explicit TypeScript types, relative imports, two-space
  indentation, double quotes, semicolons, and `tslog` sub-loggers.
- Fallow is the Hono audit gate after source changes.

### Integration Points

- `ReadOptimisedAggregator.rebuildTrace` is currently a stub and should remain
  behaviorally stubbed in Phase 2; later phases will wire it to materialization.
- Phase 2 contracts should give Phase 3 enough surface to load checkpoints,
  read/write latest state, write summaries, and advance checkpoints after
  successful writes.
- Phase 2 should not expose projection-specific fetch-all methods; Phase 4 will
  define bounded projection repository reads.

</code_context>

<specifics>
## Specific Ideas

- The user chose exact checkpoint bookmarks over simple time bookmarks.
- The user chose history-friendly/versioned latest-state rows over overwrite
  semantics.
- The user chose named diagnostic columns over a flexible diagnostics map.
- The user chose to define only next-phase materialization needs, keeping
  projection-facing repository methods for later phases.

</specifics>

<deferred>
## Deferred Ideas

- Projection-facing repository methods are deferred to Phase 4.
- Materialization/rebuild behavior is deferred to Phase 3.
- Ghost projection logic is deferred to Phase 5.
- HTTP read routes are deferred outside v1.

</deferred>

---

*Phase: 2-Read Schema And Repository Contracts*
*Context gathered: 2026-06-05*

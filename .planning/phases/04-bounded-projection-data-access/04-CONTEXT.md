# Phase 4: Bounded Projection Data Access - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds bounded, trace-scoped projection data access to the Hono read
repository. The repository should expose methods that require `userId` and
`traceId`, read only enough latest read-model rows for the next projection
phase, enforce hard node and edge caps at the repository layer, and return cap
metadata so callers know when a bounded read is incomplete.

This phase does not add HTTP routes, frontend behavior, ghost projection logic,
full pagination or windowing, SDK behavior, durable auth, or `carno.js`
implementation. Phase 5 owns the actual ghost projection algorithm that consumes
these bounded reads.

</domain>

<decisions>
## Implementation Decisions

### Cap Behavior

- **D-01:** When a projection read exceeds a cap, the repository should return
  the bounded rows it safely read and set explicit metadata such as `capHit`.
  It should not throw merely because more rows exist.
- **D-02:** Cap metadata must be part of the projection-facing return type so
  Phase 5 can report incomplete projection state in response metadata.
- **D-03:** Use a `LIMIT cap + 1` probe for cap detection. Return only the first
  `cap` rows and set `capHit` when the extra probe row exists.

### Cap Source

- **D-04:** Use repository-level constants for v1 cap defaults. Do not introduce
  runtime environment configuration for projection caps in this phase.
- **D-05:** Constants should be named and easy to test, but the production
  projection methods should always enforce them internally.

### Repository Boundary

- **D-06:** Add bounded projection read methods to the existing `ILogReadRepo`
  contract instead of introducing a separate `ILogProjectionRepo`.
- **D-07:** Keep the methods projection-facing but repository-scoped: services
  and workers still depend on contracts, and ClickHouse access stays inside the
  ClickHouse repository implementation.
- **D-08:** Keep the existing materialization methods on `ILogReadRepo` stable
  unless the planner finds a small type extraction is needed to keep the
  contract readable.

### Edge Read Strategy

- **D-09:** Phase 4 should add visible-node edge reads. The bounded edge method
  should return edges whose endpoints are in or near the bounded visible-node
  set needed by the next projection step.
- **D-10:** Do not build flow-order span edge reading as the primary Phase 4
  strategy. The planner may add small helpers only if needed to keep the
  visible-node edge method safe and deterministic.
- **D-11:** Phase 5 remains responsible for snapping edges through ghosts and
  aggregating projected edges.

### Full-Trace Read Safety

- **D-12:** Production projection methods must not fetch all nodes or all edges
  for a trace.
- **D-13:** Tests may use tiny full-trace fixtures or existing full latest-state
  loaders to set up expected data, but the production bounded projection path
  must prove it uses capped projection methods.
- **D-14:** The planner should include tests that inspect query text or fake
  client calls to prove projection methods are trace-scoped and use `LIMIT`
  with the cap probe.

### Scope Locks

- **D-15:** Do not add HTTP read routes in Phase 4. v1 route work remains out of
  scope.
- **D-16:** Do not add ghost node generation, snapped edge aggregation, hidden
  range summarization, or response rendering in Phase 4.
- **D-17:** Do not touch `carno.js`, frontend, or SDK code for this phase.
- **D-18:** Continue following `hono-server/src/code-base.md`: repository
  implementations may access ClickHouse, but services and workers must not.

### the agent's Discretion

- The planner may choose exact method names and return type names as long as
  they clearly describe bounded projection reads and expose cap metadata.
- The planner may choose exact cap constant values if they are conservative,
  documented in tests or code comments, and can be adjusted later without
  changing API semantics.
- The planner may choose whether projection-facing types live in public
  `api/types.ts` or internal repo types, provided database-only row shapes do
  not leak into public API contracts.
- The planner may decide the exact fake-client assertion style for proving
  scoped `WHERE user_id = ... AND trace_id = ...` filters and `LIMIT cap + 1`
  behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope And Requirements

- `.planning/PROJECT.md` - Defines Hono-only scope, ClickHouse read-model goal,
  threshold projection semantics, hard safety-cap constraint, and deferred
  pagination/windowing.
- `.planning/ROADMAP.md` - Defines Phase 4 goal, dependency on Phase 3, and
  success criteria for bounded projection data access.
- `.planning/REQUIREMENTS.md` - Defines Phase 4 requirements `SAFE-01` through
  `SAFE-04` plus downstream projection requirements that these methods must
  prepare for.
- `.planning/STATE.md` - Records Phase 3 completion and Phase 4 as current
  planning target.

### Prior Phase Contracts

- `.planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md` -
  Locks read-model table semantics, repository contract shape, and checkpoint
  separation.
- `.planning/phases/03-checkpointed-materialization/03-CONTEXT.md` - Locks
  Phase 4 ownership of bounded projection reads and Phase 5 ownership of ghost
  projection.
- `.planning/phases/03-checkpointed-materialization/03-03-SUMMARY.md` -
  Confirms worker delegation to materialization and documents deferred
  projection scope.
- `.planning/phases/03-checkpointed-materialization/03-TECHNICAL.md` -
  Explains current materialization flow, latest read-model rows, flow order, and
  retry/checkpoint behavior.

### Hono Architecture Rules

- `hono-server/src/code-base.md` - Mandatory Hono architecture guide for service
  boundaries, repository contracts, type placement, ClickHouse access, and
  logging.
- `.planning/codebase/STACK.md` - Records Hono, ClickHouse web client, Wrangler,
  Bun, TypeScript, and Fallow tooling context.
- `.planning/codebase/ARCHITECTURE.md` - Records explicit-edge graph model,
  read-model architecture, ClickHouse query style, and anti-patterns.
- `.planning/codebase/INTEGRATIONS.md` - Records ClickHouse client setup,
  runtime environment boundaries, and logging conventions.

### Current Hono Log Module

- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` - Existing
  read-model repository contract that Phase 4 should extend with bounded
  projection methods.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` -
  Existing ClickHouse repository implementation that already loads latest
  materialized nodes, edges, summaries, checkpoints, and raw events.
- `hono-server/src/services/log/internal/repo/types.ts` - Internal row and
  repository-local types for ClickHouse mapping.
- `hono-server/src/services/log/api/types.ts` - Public read-model types and
  possible home for projection-facing non-row types if needed.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
  - Fake-client query and mapping tests to extend for bounded projection
  methods and cap assertions.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` - Contract
  assertion tests that currently guard repo shape and may need projection-safe
  updates.
- `hono-server/src/infra/db/clickhouse/schema.ts` - ClickHouse table definitions
  for read nodes and read edges, including `importance_level`, `flow_order`,
  `from_flow_order`, and `to_flow_order`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ILogReadRepo` already centralizes read-side persistence needs for
  materialization and is the selected contract to extend for projection reads.
- `LogReadRepoClickHouse` already uses constructor-injected ClickHouse client
  providers, which supports fake-client tests for query text, query params, and
  result mapping.
- `ReadNode` contains `importanceLevel` and `flowOrder`, which are sufficient
  for bounded visible-node reads by threshold.
- `ReadEdge` contains explicit endpoint ids plus denormalized endpoint flow
  orders, which supports bounded visible-node edge reads without inferring graph
  links from node ids.
- `CLICKHOUSE_READ_NODES_TABLE` and `CLICKHOUSE_READ_EDGES_TABLE` constants
  already exist and should be reused in projection queries.

### Established Patterns

- Latest read rows use grouped `argMax(..., materialized_at_ms)` queries instead
  of `FINAL`.
- Repository methods must scope queries by `user_id` and `trace_id`.
- Hono service code should depend on contracts, not concrete ClickHouse repos.
- ClickHouse implementation tests use fake clients and assert query strings,
  query params, and mapped return values.
- Hono TypeScript uses explicit object parameters, plain types, relative
  imports, two-space indentation, double quotes, and semicolons.

### Integration Points

- Extend `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` with
  bounded projection read methods.
- Add any projection-facing DTOs to `hono-server/src/services/log/api/types.ts`
  or repo-local internal types according to the final contract boundary.
- Implement ClickHouse queries in
  `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`.
- Extend fake-client tests in
  `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`.
- Update contract/source assertion tests in
  `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` so Phase 4
  projection terms are allowed only for bounded projection methods.

</code_context>

<specifics>
## Specific Ideas

- Prefer partial bounded results with explicit cap metadata over failing the
  projection read.
- Prefer a simple v1 repository-constant cap model over environment wiring.
- Keep production projection reads safe even when tests use tiny full-trace
  fixtures for setup.

</specifics>

<deferred>
## Deferred Ideas

- Ghost node generation, hidden range summaries, snapped edge aggregation, and
  projected response metadata belong to Phase 5.
- HTTP read routes, query parameter validation, and route error mapping remain
  out of scope for this v1 milestone.
- Runtime-tunable projection cap configuration can be considered later if
  product or operations need it.

</deferred>

---

*Phase: 4-Bounded Projection Data Access*
*Context gathered: 2026-06-05*

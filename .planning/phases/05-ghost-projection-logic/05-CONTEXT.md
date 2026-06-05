# Phase 5: Ghost Projection Logic - Context

**Gathered:** 2026-06-05T15:47:26Z
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds internal Hono graph projection logic that turns materialized
latest read-model state into an importance-threshold graph. The projection
should compute visible nodes, deterministic ghost nodes, snapped aggregate
edges, and response metadata from bounded inputs. Ghosts are read-time
projection artifacts; they are not precomputed or stored per threshold.

This phase does not add HTTP routes, frontend behavior, SDK behavior,
`carno.js` implementation, durable auth, full pagination/windowing, or
production full-trace projection paths.

</domain>

<decisions>
## Implementation Decisions

### Hidden Context Budget

- **D-01:** Compute ghost projection at read time in application memory for v1.
  Do not materialize or store ghost nodes for every importance threshold.
- **D-02:** Use bounded in-memory projection. Load only capped projection inputs
  for production projection behavior; do not load an entire trace in normal
  production paths.
- **D-03:** When bounded inputs are incomplete because a cap was hit, return the
  best partial projected graph and include explicit cap metadata. Do not throw
  solely because the projection was truncated.
- **D-04:** Keep explicit edges as the graph source of truth. Do not store
  ancestry paths on every node for v1.
- **D-05:** Traces are intended to be tree-like or single-parent in normal
  product data, but projection should still degrade deterministically if
  malformed or multi-parent edge data appears.
- **D-06:** Put the projection algorithm in a pure, testable internal component
  under the Hono log service internals. Repositories should stay focused on
  ClickHouse reads, and routes should not contain projection business logic.

### Ghost Shape

- **D-07:** Use deterministic range-based ghost IDs containing trace id, selected
  threshold, and hidden flow-order range, for example
  `ghost:{traceId}:{threshold}:{startFlowOrder}:{endFlowOrder}`.
- **D-08:** Create one ghost node for each contiguous hidden `flowOrder` run.
  Hidden prefixes, middle gaps, suffixes, and all-hidden traces use the same
  range rule.
- **D-09:** Each ghost node should include the full required v1 summary:
  hidden node count, hidden edge count, node type counts, minimum and maximum
  hidden importance level, time range, and flow-order range.
- **D-10:** If all bounded input nodes are hidden at the selected threshold,
  return one deterministic all-hidden ghost plus metadata rather than returning
  an empty graph or an error.

### Edge Snapping

- **D-11:** Keep visible-to-visible edges direct when both endpoints are visible.
  Do not route a real direct edge through a ghost merely because hidden nodes
  exist elsewhere in the flow order.
- **D-12:** Snap hidden-touching edges to the ghost for the hidden endpoint's
  flow-order range: visible-to-hidden becomes visible-to-ghost,
  hidden-to-visible becomes ghost-to-visible, and hidden-to-hidden across
  different ghost ranges becomes ghost-to-ghost.
- **D-13:** Hidden-to-hidden edges inside the same ghost range should increment
  the ghost's hidden edge summary count and should not be returned as projected
  self-loop edges.
- **D-14:** Aggregate projected edges by snapped source, snapped target, and edge
  type. Return one projected edge with a count instead of emitting duplicate
  snapped edges.
- **D-15:** Omit orphan or malformed edges from projected edges. Do not invent
  endpoints or attach them to the nearest ghost; expose omitted counts through
  diagnostics or response metadata.

### Scope Locks

- **D-16:** Do not add Hono HTTP routes in this phase. Route exposure remains
  outside v1 Phase 5 scope.
- **D-17:** Do not touch frontend, SDK, or `carno.js` files in this phase.
- **D-18:** Do not add full pagination, ghost drill-down, or focused-window
  behavior in this phase.

### the agent's Discretion

- The planner may choose exact internal component names and file placement under
  `hono-server/src/services/log/internal`, as long as the projection component
  is pure/testable and follows `hono-server/src/code-base.md`.
- The planner may choose exact public/internal DTO names for projected nodes,
  ghost nodes, projected edges, and metadata, provided database row shapes do
  not leak into public API types.
- The planner may decide whether projected graph DTOs live in public
  `api/types.ts` or internal projection types based on current service-boundary
  needs, but the types must be explicit and stable enough for Phase 6 tests.
- The planner may choose the exact field name for projected edge counts, such
  as `edgeCount` or `count`, if tests document the chosen contract.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope And Requirements

- `.planning/PROJECT.md` - Defines Hono-only scope, threshold semantics,
  read-time ghost projection, flow-order ghosting, safety caps, and deferred
  pagination/windowing.
- `.planning/ROADMAP.md` - Defines Phase 5 goal, dependency on Phase 4, and
  success criteria for ghost projection logic.
- `.planning/REQUIREMENTS.md` - Defines pending Phase 5 requirements
  `GPRJ-01` through `GPRJ-09` and out-of-scope v2 read/windowing work.
- `.planning/STATE.md` - Records the current milestone state and Phase 5 as the
  next planning target.

### Prior Phase Contracts

- `.planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md` -
  Locks latest read-model row semantics, checkpoint separation, and repository
  contract boundaries.
- `.planning/phases/03-checkpointed-materialization/03-CONTEXT.md` - Locks
  explicit-edge flow-order semantics, deterministic malformed-graph behavior,
  and Phase 5 ownership of ghost projection.
- `.planning/phases/04-bounded-projection-data-access/04-CONTEXT.md` - Locks
  repository cap behavior, bounded visible-node and visible-node edge reads,
  and Phase 5 ownership of snapping and aggregation.
- `.planning/phases/04-bounded-projection-data-access/04-TECHNICAL.md` -
  Documents the exact Phase 4 bounded read methods, cap constants, query
  strategy, and deferred ghost projection scope.

### Hono Architecture Rules

- `hono-server/src/code-base.md` - Mandatory Hono guide for service boundaries,
  repository contracts, type placement, ClickHouse access, and logging.
- `.planning/codebase/STACK.md` - Records Hono, ClickHouse web client, Wrangler,
  Bun, TypeScript, and Fallow tooling context.
- `.planning/codebase/ARCHITECTURE.md` - Records explicit-edge graph model,
  read-model architecture, ClickHouse latest-row query style, and graph
  anti-patterns.
- `.planning/codebase/INTEGRATIONS.md` - Records ClickHouse setup, Hono runtime
  boundaries, event bus, logging, and environment constraints.

### Current Hono Log Module

- `hono-server/src/services/log/api/types.ts` - Existing read-model public types
  and cap result types; likely home or reference point for projection-facing
  DTOs.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` - Existing read
  repository contract with `loadBoundedVisibleNodes` and
  `loadBoundedVisibleEdges`.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` -
  Existing ClickHouse implementation of bounded projection reads.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
  - Existing fake-client tests for bounded read queries and cap behavior.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` - Contract
  assertion tests guarding read-repo shape.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ReadNode` already has `importanceLevel`, `flowOrder`, `nodeType`, time
  fields, and `materializedAt`, which are enough to decide visible nodes and
  summarize hidden ranges in bounded memory.
- `ReadEdge` already has explicit endpoint ids plus denormalized endpoint flow
  orders, which are enough to snap edges through ghosts without inferring links
  from node ids or start order.
- `BoundedVisibleNodesResult` and `BoundedVisibleEdgesResult` already carry
  cap metadata that Phase 5 should propagate into projection metadata.
- `DEFAULT_PROJECTION_NODE_CAP` and `DEFAULT_PROJECTION_EDGE_CAP` are already
  enforced inside `ILogReadRepo` / `LogReadRepoClickHouse`.

### Established Patterns

- Hono service modules keep public types in `api`, implementation details in
  `internal`, and persistence behind repository contracts.
- ClickHouse repository implementations should not contain graph projection
  business logic beyond bounded data access.
- Tests in `hono-server` use fake clients and source assertions for repository
  behavior; Phase 5 should add focused pure projection fixtures.
- Latest read rows are selected through grouped `argMax(..., materialized_at_ms)`
  queries rather than `FINAL`.
- The project must preserve explicit-edge graph semantics and avoid inferred
  ancestry paths.

### Integration Points

- Add an internal projection component under
  `hono-server/src/services/log/internal`, likely near the log service
  implementation or as a projection-specific internal helper.
- Define projected graph, ghost node, projected edge, and metadata types in the
  appropriate Hono log type boundary.
- Consume `ILogReadRepo.loadBoundedVisibleNodes` and
  `ILogReadRepo.loadBoundedVisibleEdges` through service/repository contracts
  when wiring projection orchestration.
- Extend Hono tests with pure projection fixtures covering threshold visibility,
  hidden prefixes/suffixes, all-hidden traces, snapped edges, aggregation, caps,
  and malformed/orphan edges.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly accepted bounded in-memory projection for v1.
- The user rejected storing ancestry paths for v1.
- The user expects normal traces to be tree-like or single-parent, but the
  implementation should still use explicit edges and degrade safely when data
  is malformed.
- Range-based ghost ids should be stable enough for deterministic tests and
  future UI caching.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Ghost Projection Logic*
*Context gathered: 2026-06-05T15:47:26Z*

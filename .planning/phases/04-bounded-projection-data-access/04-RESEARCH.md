# Phase 4: Bounded Projection Data Access - Research

## RESEARCH COMPLETE

## Objective

Research how to plan Phase 4 so Hono projection reads are scoped, bounded, and
ready for Phase 5 ghost projection without letting production code fetch entire
million-node traces.

## Inputs Read

- `.planning/phases/04-bounded-projection-data-access/04-CONTEXT.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md`
- `.planning/phases/03-checkpointed-materialization/03-CONTEXT.md`
- `.planning/phases/03-checkpointed-materialization/03-TECHNICAL.md`
- `hono-server/src/code-base.md`
- `hono-server/src/services/log/api/types.ts`
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts`
- `hono-server/src/services/log/internal/repo/types.ts`
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- `hono-server/src/infra/db/clickhouse/schema.ts`

## Current Code Shape

The read repository already owns three important latest-state surfaces:

- `loadLatestReadModel({ userId, traceId })` loads all latest read nodes and
  edges for materialization. This is acceptable for the checkpointed
  materializer but must not become the projection read path.
- `LogReadRepoClickHouse` uses grouped `argMax(..., materialized_at_ms)` queries
  to read latest rows without `FINAL`.
- Fake-client tests already capture query text, query params, and mapped rows,
  which is enough to prove trace scope, cap probe limits, and no full-trace
  projection path.

The read tables contain the columns Phase 4 needs:

- `read_nodes`: `user_id`, `trace_id`, `importance_level`, `flow_order`, and
  `materialized_at_ms`.
- `read_edges`: `user_id`, `trace_id`, `from_node_id`, `to_node_id`,
  `from_flow_order`, `to_flow_order`, `edge_type`, and `materialized_at_ms`.

## Recommended Contract

Extend `ILogReadRepo` rather than adding a new repository:

- `loadBoundedVisibleNodes({ userId, traceId, threshold })`
- `loadBoundedVisibleEdges({ userId, traceId, nodeIds })`

The return types should include rows plus cap metadata:

- `cap`
- `returnedCount`
- `capHit`

Repository constants should supply v1 caps:

- `DEFAULT_PROJECTION_NODE_CAP`
- `DEFAULT_PROJECTION_EDGE_CAP`

The exact numeric values are not product-critical in this phase. Pick
conservative values and assert they are used in query params as `cap + 1`.

## ClickHouse Query Approach

### Visible Nodes

Use a latest-state subquery, then filter the latest projected columns:

1. Scope inside the subquery with `WHERE user_id = {userId:String} AND trace_id =
   {traceId:String}`.
2. Group by `id` and use `argMax` for latest node fields.
3. Filter outside the grouped subquery with `WHERE importance_level <=
   {threshold:Int32}`.
4. Sort by `flow_order ASC, id ASC`.
5. Use `LIMIT {limit:UInt32}` where `limit` is `DEFAULT_PROJECTION_NODE_CAP + 1`.
6. Return only the first `DEFAULT_PROJECTION_NODE_CAP` mapped nodes and set
   `capHit` if the extra row exists.

### Visible-Node Edges

Use a latest-state subquery and a visible-node id array:

1. If `nodeIds.length === 0`, return `{ edges: [], cap: { capHit: false } }`
   without querying ClickHouse.
2. Scope inside the subquery with `WHERE user_id = {userId:String} AND trace_id =
   {traceId:String}`.
3. Group by `id` and use `argMax` for latest edge fields.
4. Filter outside the grouped subquery with `has({nodeIds:Array(String)},
   from_node_id) OR has({nodeIds:Array(String)}, to_node_id)`.
5. Sort by `least(from_flow_order, to_flow_order) ASC, id ASC`.
6. Use `LIMIT {limit:UInt32}` where `limit` is `DEFAULT_PROJECTION_EDGE_CAP + 1`.
7. Return only the first `DEFAULT_PROJECTION_EDGE_CAP` mapped edges and set
   `capHit` if the extra row exists.

This gives Phase 5 enough edge data for visible-node-adjacent projection while
avoiding a trace-wide edge scan.

## Test Strategy

Phase 4 can be covered with focused fake-client tests:

- Contract/type tests prove `ILogReadRepo` exposes the new methods and the
  projection return types carry cap metadata.
- Node query tests prove threshold filtering, trace scope, deterministic order,
  and `LIMIT cap + 1`.
- Node mapping tests prove returned rows are sliced to the cap and `capHit`
  reflects the probe row.
- Edge query tests prove empty `nodeIds` short-circuits, non-empty calls use
  visible-node endpoint filters, trace scope, deterministic ordering, and
  `LIMIT cap + 1`.
- Source assertions prove projection tests never require production full-trace
  reads and bounded methods do not call `loadLatestReadModel`.

## Validation Architecture

Automated validation should rely on the existing Bun test setup:

- Contract tests: `cd hono-server && bun test src/services/log/internal/repo/ILogReadRepo.test.ts`
- Repository fake-client tests: `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- Full Hono suite: `cd hono-server && bun test`
- Static audit: `cd hono-server && bun run fallow`

No manual-only validation is needed. Phase 4 is a repository/data-access phase
with deterministic behavior assertions.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Filtering latest rows incorrectly before `argMax` | Use grouped latest-state subquery before threshold or endpoint filtering. |
| False cap signal when returned length equals cap | Use `LIMIT cap + 1` probe and slice to cap. |
| Production code reuses `loadLatestReadModel` for projection | Add source assertions and plan must-haves forbidding full-trace projection. |
| Edge query grows dense around visible nodes | Enforce a separate edge cap and report `capHit`. |
| Public API leaks database row shapes | Keep row types in `internal/repo/types.ts`; only expose plain projection DTOs if contract requires them. |

## Planning Recommendation

Use three dependent waves:

1. Contract and types: add projection DTOs/constants and `ILogReadRepo` methods,
   with contract tests.
2. Bounded visible nodes: implement scoped latest-node query with threshold,
   `LIMIT cap + 1`, mapping, and cap metadata tests.
3. Bounded visible-node edges: implement scoped latest-edge query with visible
   node id filter, `LIMIT cap + 1`, empty-input short-circuit, source safety
   assertions, and final verification.


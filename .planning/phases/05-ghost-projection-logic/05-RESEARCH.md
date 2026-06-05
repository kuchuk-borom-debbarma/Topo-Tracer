# Phase 5: Ghost Projection Logic - Research

## RESEARCH COMPLETE

## Objective

Research how to plan Phase 5 so Hono can project materialized latest read-model
state into a bounded importance-threshold graph with deterministic ghosts,
snapped aggregate edges, and cap metadata.

## Inputs Reviewed

- `.planning/phases/05-ghost-projection-logic/05-CONTEXT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `hono-server/src/code-base.md`
- `hono-server/src/services/log/api/types.ts`
- `hono-server/src/services/log/api/ILogService.ts`
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts`
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts`
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts`

## Key Findings

### Current bounded reads are necessary but not sufficient

Phase 4 added `loadBoundedVisibleNodes` and `loadBoundedVisibleEdges`. These
methods are safe, trace-scoped, capped, and use `LIMIT cap + 1`, but visible-only
node reads cannot produce ghost summaries for hidden-only input. For example, if
all nodes have `importanceLevel > selectedThreshold`, `loadBoundedVisibleNodes`
returns no nodes, which leaves Phase 5 with nothing to summarize into the
required all-hidden ghost.

Phase 5 should therefore add a bounded projection-input read that returns the
first capped latest nodes in deterministic `flowOrder` order regardless of
visibility, plus cap metadata. This still honors the user's decision to compute
ghosts in memory from bounded inputs and avoids production full-trace reads.

### Projection should be pure and fixture-heavy

The projection algorithm can be implemented as a pure internal component that
takes:

- `userId`
- `traceId`
- `threshold`
- bounded latest `ReadNode[]`
- bounded `ReadEdge[]`
- node and edge cap metadata

and returns:

- normal visible projected nodes
- deterministic ghost nodes for contiguous hidden flow-order runs
- projected edges snapped through ghosts and aggregated
- metadata with counts, threshold, materialization timestamp, cap hits, and
  omitted malformed edge counts

This shape keeps ClickHouse access in repositories, orchestration in services,
and graph rules in a focused, testable internal projection component.

### Type placement

Projection result types are user-facing service output shapes even though v1
does not add HTTP routes. They should live in `hono-server/src/services/log/api/types.ts`
as plain explicit types, while any helper maps or internal intermediate shapes
can live beside the internal projector.

Suggested public types:

- `ProjectedGraphNode`
- `ProjectedNormalNode`
- `ProjectedGhostNode`
- `ProjectedGraphEdge`
- `ProjectedGraphMetadata`
- `ProjectedGraphResult`
- `BoundedProjectionNodesResult`

The existing `ProjectionReadCap` type can be reused in metadata for node and
edge cap reporting.

### Repository extension

Add `loadBoundedProjectionNodes(params: { userId; traceId })` to `ILogReadRepo`
and implement it in `LogReadRepoClickHouse` with the same grouped latest-state
query style used by `loadBoundedVisibleNodes`, ordered by `flow_order ASC, id ASC`
and capped by `DEFAULT_PROJECTION_NODE_CAP + 1`.

This read is intentionally not threshold-filtered. It is bounded input for the
in-memory projector, not a full trace read.

### Service orchestration

Add a service-level method such as `projectTraceGraph({ userId, traceId, threshold })`.
The service should:

1. Call `loadBoundedProjectionNodes`.
2. Pass the returned node ids to `loadBoundedVisibleEdges` or a renamed/generalized
   bounded edge read if implementation chooses to include all bounded projection
   node ids.
3. Call the internal projector.
4. Log safe summary fields only: `userId`, `traceId`, threshold, returned counts,
   cap hits, and omitted malformed edge count.

No route mounting belongs in Phase 5.

## Algorithm Notes

1. Sort bounded nodes by `flowOrder ASC, id ASC`.
2. Mark normal visibility with `importanceLevel <= threshold`.
3. Build a map from node id to either normal projected node id or ghost id.
4. Create one ghost per contiguous hidden flow-order run.
5. Aggregate ghost fields:
   - `hiddenNodeCount`
   - `hiddenEdgeCount`
   - `nodeTypeCounts`
   - `minImportanceLevel`
   - `maxImportanceLevel`
   - `startedAt`
   - `endedAt`
   - `flowOrderStart`
   - `flowOrderEnd`
6. Snap each edge:
   - visible-to-visible stays direct
   - visible-to-hidden becomes visible-to-ghost
   - hidden-to-visible becomes ghost-to-visible
   - hidden-to-hidden across different ghosts becomes ghost-to-ghost
   - hidden-to-hidden inside one ghost increments `hiddenEdgeCount`
7. Aggregate projected edges by snapped source, snapped target, and edge type.
8. Omit orphan/malformed edges whose endpoints are not in the bounded node map;
   count them in metadata.

## Validation Architecture

Phase 5 validation should be fixture-first and goal-backward:

- Contract/source tests prove projection types exist and no ancestry-path fields
  are introduced.
- Repository fake-client tests prove `loadBoundedProjectionNodes` is scoped by
  `userId`/`traceId`, uses grouped `argMax`, orders by `flow_order ASC, id ASC`,
  and applies `DEFAULT_PROJECTION_NODE_CAP + 1`.
- Pure projector tests cover:
  - threshold visibility (`importanceLevel <= threshold`)
  - hidden prefixes
  - hidden suffixes
  - middle hidden ranges
  - all-hidden input
  - visible-to-visible direct edges
  - visible-hidden-visible snapping
  - hidden-to-hidden same ghost summary counts
  - hidden-to-hidden cross-ghost projected edges
  - duplicate snapped edge aggregation
  - orphan/malformed edge omission counts
  - node and edge cap metadata propagation
- Service tests prove orchestration calls bounded repository methods, never
  calls `loadLatestReadModel`, and logs safe summaries without raw node/edge
  payloads.

## Risks

- **Hidden input gap:** If Phase 5 only uses `loadBoundedVisibleNodes`, it cannot
  build all-hidden ghosts. Mitigation: add bounded projection-node input.
- **Type leakage:** Projection DTOs should not expose database row shapes.
  Mitigation: explicit API types and contract tests.
- **Edge explosion:** Snapping hidden edges can create duplicates. Mitigation:
  aggregate by snapped source, target, and edge type.
- **Accidental full trace load:** Service orchestration must not call
  `loadLatestReadModel`. Mitigation: source assertions and service tests.

## Recommended Plan Shape

1. **Projection contracts and bounded node input** - add projection DTOs,
   repository method contract, fake-client tests, and ClickHouse implementation.
2. **Pure in-memory projector** - add internal component with fixture tests for
   ghost ranges, summaries, snapping, aggregation, and metadata.
3. **Service orchestration and docs** - expose internal service method, wire
   bounded repo reads to projector, add safe logging tests, and document Phase 5.

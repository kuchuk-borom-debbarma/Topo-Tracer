# Phase 4 Technical: Bounded Projection Data Access

This document details the repository contract and implementation patterns for bounded projection data access introduced in Phase 4.

## Repository Contract

The `ILogReadRepo` provides two methods for performance-safe projection data access:

1. `loadBoundedVisibleNodes(params)`: Returns nodes meeting an importance threshold, capped at `DEFAULT_PROJECTION_NODE_CAP`.
2. `loadBoundedVisibleEdges(params)`: Returns edges touching a specific set of visible nodes, capped at `DEFAULT_PROJECTION_EDGE_CAP`.

Both methods use the `LIMIT cap + 1` probe pattern to detect if the data was truncated.

## Cap Constants

Caps are enforced internally by the repository implementation to ensure predictable performance:

- `DEFAULT_PROJECTION_NODE_CAP`: 500 nodes.
- `DEFAULT_PROJECTION_EDGE_CAP`: 2000 edges.

## Visible Node Query

Nodes are queried from the `read_nodes` table using a grouped `argMax` to select the latest materialized state per `id`:

```sql
SELECT * FROM (
  SELECT 
    id,
    argMax(...) as ...,
    max(materialized_at_ms) as materialized_at_ms
  FROM read_nodes
  WHERE user_id = {userId:String} AND trace_id = {traceId:String}
  GROUP BY id
)
WHERE importance_level <= {threshold:Int32}
ORDER BY flow_order ASC, id ASC
LIMIT {limit:UInt32} -- limit is cap + 1
```

## Visible-Node Edge Query

Edges are queried from the `read_edges` table similarly, but filtered by the endpoints:

```sql
SELECT * FROM (
  SELECT ...
  FROM read_edges
  WHERE user_id = {userId:String} AND trace_id = {traceId:String}
  GROUP BY id
)
WHERE has({nodeIds:Array(String)}, from_node_id) OR has({nodeIds:Array(String)}, to_node_id)
ORDER BY least(from_flow_order, to_flow_order) ASC, id ASC
LIMIT {limit:UInt32} -- limit is cap + 1
```

If `nodeIds` is empty, the repository short-circuits and returns an empty result without querying ClickHouse.

## Cap Metadata

The `ProjectionReadCap` structure informs the caller about the result boundary:

```typescript
{
  cap: number;          // The enforced cap (e.g., 500)
  returnedCount: number; // Number of items returned in this result
  capHit: boolean;      // True if more data matched the query than the cap allowed
}
```

## Full-Trace Safety

Production bounded projection methods are strictly forbidden from calling `loadLatestReadModel` or performing any full-trace scans. This is enforced by source-code assertions in tests.

## Deferred Ghost Projection

Phase 4 only provides access to explicitly materialized nodes and edges. It does NOT implement:
- **Ghost Snapping**: Snapping edges from hidden nodes to their nearest visible ancestor.
- **Ghost Node Synthesis**: Summarizing hidden subgraphs into "ghost" nodes.
- **Edge Aggregation**: Folding multiple snapped edges between the same pair of nodes.

These concerns belong to the Projection Service (Phase 5), which consumes the bounded data provided by these repository methods.

## Verification

Verification of the data access contract is performed via fake-client tests in `LogReadRepoClickHouse.test.ts`, asserting:
- Correct trace-scoping (`user_id`, `trace_id`).
- Correct threshold and endpoint filtering.
- Correct `LIMIT cap + 1` behavior and slicing.
- Correct deterministic ordering.

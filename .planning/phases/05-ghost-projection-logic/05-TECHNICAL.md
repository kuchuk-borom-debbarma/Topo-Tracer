# Phase 5 Technical Documentation: Ghost Projection Logic

This document explains the technical implementation of the Phase 5 ghost projection algorithm and its boundaries within the Hono log service.

## Bounded In-Memory Projection

Projection orchestration in Topo-Tracer follows a "Read Bounded, Project in Memory" pattern. The service does not attempt to load the entire trace or any unbounded ancestry paths. Instead, it obtains a fixed-size subset of nodes and edges from the repository and transforms them into a projected graph.

### Projection Input Reads

The `LogServiceImpl` orchestrates the following reads:
1. `loadBoundedProjectionNodes`: Loads nodes for the trace, capped at `DEFAULT_PROJECTION_NODE_CAP` (500).
2. `loadBoundedVisibleEdges`: Loads edges where both `fromNodeId` and `toNodeId` are present in the previously loaded nodes, capped at `DEFAULT_PROJECTION_EDGE_CAP` (2000).

Both calls are scoped by `userId` and `traceId`.

## Ghost Node Implementation

Ghost nodes represent one or more "hidden" nodes that fall above the visibility threshold.

### Threshold Rule
A node is visible if:
`importanceLevel <= threshold`

### Deterministic Ghost IDs
Ghost IDs are stable and deterministic based on the trace, threshold, and the contiguous run of hidden nodes in flow order:
`ghost:{traceId}:{threshold}:{flowOrderStart}:{flowOrderEnd}`

### Ghost Shape
Each ghost node summarizes its hidden members:
- `hiddenNodeCount`: Total number of hidden nodes in this run.
- `hiddenEdgeCount`: Total number of edges where both endpoints are hidden within this same ghost.
- `nodeTypeCounts`: Aggregate count of node types within the ghost.
- `minImportanceLevel` / `maxImportanceLevel`: Range of importance levels among hidden nodes.
- `startedAt` / `endedAt`: Time boundary of the hidden run.
- `flowOrderStart` / `flowOrderEnd`: Flow order boundary of the hidden run.

## Edge Snapping and Aggregation

Edges are "snapped" to the nearest projected node (normal or ghost).

### Snapping Rules
1. If both endpoints of an edge are visible (normal nodes), the edge remains as-is but is aggregated.
2. If an endpoint is hidden, it snaps to the ghost node containing that hidden node.
3. If both endpoints snap to the same ghost node, the edge is counted in the ghost's `hiddenEdgeCount` and removed from the edge list.
4. If an edge endpoint cannot be mapped to any projected node (due to capping), the edge is omitted.

### Aggregation
Edges are aggregated by their projected endpoints and type. The aggregate key is:
`${projectedFromId}|${projectedToId}|${edgeType}`

Aggregated edges include:
- `edgeCount`: Number of original edges merged into this aggregate.
- `startedAt` / `endedAt`: Min/max time range of merged edges.

## Partial Projection Metadata

Every projection result includes metadata to inform the caller about the projection state:
- `nodeCap` / `edgeCap`: Includes the cap limit and whether a "cap hit" occurred (truncation).
- `omittedEdgeCount`: Number of edges dropped because one or both endpoints were missing from the bounded node set.
- `visibleNodeCount` / `ghostNodeCount`: Distribution of projected nodes.
- `materializedAt`: The maximum `materializedAt` timestamp among all input nodes and edges.

## Malformed Edge Handling

Edges referencing non-existent nodes or nodes outside the current trace/user scope are naturally handled by the snapping logic:
- If a node ID is not in the `nodeProjectionById` map, the edge is dropped and incremented in `omittedEdgeCount`.
- This ensures that only edges with two valid projected endpoints are returned.

## Service Boundary

The `ILogService.projectTraceGraph` method is the internal entry point.
- **No HTTP routes:** Projection is currently internal-only.
- **Safe Logging:** Service logs only summary metadata (counts, ids, caps). Raw node/edge payloads are never logged.
- **No ancestry leakage:** The implementation strictly avoids `ancestorPath` or full-trace recursive reads.

## Deferred Work

- **Pagination:** Not supported in v1 projection.
- **Drill-down:** Not supported in v1; ghosts are atomic summaries.
- **Focused-window:** The current implementation uses a simple flow-order-based cap rather than a temporal or importance-based sliding window.

## Verification

Implementation is verified via:
1. `LogGraphProjector.test.ts`: Pure logic tests for ghosting, snapping, and aggregation.
2. `LogServiceImpl.test.ts`: Orchestration tests ensuring correct repository calls and safe logging.
3. `ILogReadRepo.test.ts`: Source boundary assertions ensuring no leakage of forbidden patterns.

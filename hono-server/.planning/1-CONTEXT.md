# Phase 1 Context: Trace Flow Endpoint

## Implementation Decisions

### 1. Logic Strategy: REUSE
- **Decision:** The `/api/v1/traces/:traceId/flow` endpoint will directly invoke the existing `ILogService.projectTraceGraph` method.
- **Rationale:** The existing projection logic already handles threshold-based node collapsing (ghost nodes), topological sorting (`flowOrder`), and cursor-based pagination. Reusing it ensures consistency between the "graph" and "flow" views while minimizing code duplication.

### 2. Pagination Stability: STRICT
- **Decision:** Maintain the current `ConflictError` behavior.
- **Rationale:** If a trace is re-materialized (data updated) while a user is paging through the flow, the API will throw a 409 Conflict. This ensures the user doesn't see duplicate or missing nodes due to shifting offsets in a changed dataset.

### 3. Default Filtering: SUMMARY FIRST
- **Decision:** Default `threshold` will be `0`.
- **Rationale:** Users will see high-importance nodes by default, with less important details collapsed into "ghost" nodes. They can increase the threshold via query parameters to see more detail.

### 4. Safety Caps: 1000 NODES
- **Decision:** The hard cap for a single page of flow data remains at 1000 nodes.
- **Rationale:** This preserves system stability and ensures the frontend remains responsive when rendering the flow.

## Architectural Constraints
- **Endpoint:** `GET /api/v1/traces/:traceId/flow`
- **Auth:** Must use `jwtAuthMiddleware`.
- **Service Dependency:** `LogServiceImpl`.
- **Repository Dependency:** `LogReadRepoClickHouse` (Materialized tables).

## Next Steps
1. Update `src/index.ts` to register the new route.
2. Ensure the route handler correctly maps query parameters (`threshold`, `limit`, `cursor`) to the service call.
3. Validate with integration tests.

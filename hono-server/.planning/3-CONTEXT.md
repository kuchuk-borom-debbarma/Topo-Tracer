# Phase 3 Context: Global Rename & Flow Endpoint

## Implementation Decisions

### 1. Global Rename: "Graph" -> "Flow"
- **Decision:** All occurrences of "graph" (case-insensitive) related to trace visualization will be renamed to "flow".
- **Renames include:**
  - `projectTraceGraph` -> `projectTraceFlow`
  - `LogGraphProjector` -> `LogFlowProjector`
  - `ProjectedGraphResult` -> `ProjectedFlowResult`
  - `ProjectedGraphNode` -> `ProjectedFlowNode`
  - `ProjectedGraphEdge` -> `ProjectedFlowEdge`
  - `ProjectedGraphMetadata` -> `ProjectedFlowMetadata`
  - File renames: `LogGraphProjector.ts` -> `LogFlowProjector.ts`, etc.
- **Rationale:** Ensures total terminology consistency across the API, service, and infrastructure layers as requested by the user.

### 2. Route Decommissioning: REPLACE
- **Decision:** The `/api/v1/traces/:traceId/graph` route will be removed and replaced by `GET /api/v1/traces/:traceId/flow`.
- **Rationale:** Direct replacement to decommission the old terminology.

### 3. Robust Parameter Validation
- **Decision:** Use strict validation for query parameters:
  - `threshold`: Non-negative integer (default: 0).
  - `limit`: Integer between 1 and 1000 (default: 1000).
  - `cursor`: String (optional).
  - Invalid inputs return `400 Bad Request` with descriptive error messages.
- **Rationale:** Enhances API reliability and prevents unexpected service behavior.

### 4. Integration Testing
- **Decision:** Create a new integration test suite `src/index.flow.test.ts` to verify the `/flow` endpoint end-to-end, including validation edge cases and pagination logic.
- **Rationale:** Provides high-fidelity verification for the new endpoint.

## Architectural Constraints
- **Validation Tier:** API (Hono) using manual checks or lightweight validation logic.
- **Dependency Direction:** Routes -> Services -> Repos/Utils (Maintained).
- **Strictness:** Keep `ConflictError` for paging consistency.

## Next Steps
1. Perform global rename (Files + Symbols).
2. Register `/flow` route and decommission `/graph`.
3. Implement robust validation in the route handler.
4. Add comprehensive integration tests.

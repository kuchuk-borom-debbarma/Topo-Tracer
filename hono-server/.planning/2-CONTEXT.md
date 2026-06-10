# Phase 2 Context: Service Layer Implementation

## Implementation Decisions

### 1. Default Threshold Handling: ROUTE-LEVEL DEFAULTS
- **Decision:** The `ILogService.projectTraceGraph` signature will remain strict (requiring `threshold: number`). The default value of `0` (Summary First) will be applied at the **Route handler level** in Phase 3.
- **Rationale:** Keeps the service layer explicit and avoids modifying a shared method's default behavior that might affect other callers (like the `/graph` endpoint).

### 2. Validation Scope: INTEGRATION-FOCUSED
- **Decision:** No new service-layer unit tests will be added specifically for "flow" behavior.
- **Rationale:** The underlying logic is already shared and verified by `LogServiceImpl.test.ts`. Verification for the new endpoint will be handled via **Integration Tests** in Phase 3 to ensure the end-to-end wiring is correct.

## Architectural Constraints
- **Service Method:** `ILogService.projectTraceGraph` (REUSED).
- **Pagination:** `CursorCodec` (STRICT mode verified).
- **Error Handling:** `ConflictError` for stale cursors (Shared logic).

## Next Steps
1. Transition directly to **Phase 3: Implementation - Route & Wiring**.
2. Register `GET /api/v1/traces/:traceId/flow` in `src/index.ts`.
3. Implement the integration tests for the new endpoint.

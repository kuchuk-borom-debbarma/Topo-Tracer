# Requirements: Trace Flow Endpoint

## Functional Requirements
1. **New Route:** Implement `GET /api/v1/traces/:traceId/flow`.
2. **Authentication:** Endpoint must be protected by `jwtAuthMiddleware`.
3. **Parameters:**
   - `traceId` (path parameter)
   - `threshold` (query, default 0): Importance level filter.
   - `limit` (query): Number of nodes to return.
   - `cursor` (query): Pagination cursor.
4. **Service Integration:**
   - Extend `ILogService` interface if necessary (to clarify pagination/parameters).
   - Ensure `LogServiceImpl` correctly handles the request using `LogGraphProjector` and `ILogReadRepo`.
5. **Read Optimization:**
   - Use materialized tables in ClickHouse via `ILogReadRepo`.
   - Leverage `flowOrder` for topological sorting and deterministic pagination.
6. **Response Structure:**
   - Return a JSON object containing nodes, edges, and paging metadata.
   - Follow the established `ProjectedGraphResult` pattern or a refined version suitable for "flow".

## Non-Functional Requirements
- **Performance:** Ensure sub-second response times for typical traces by using read-optimized tables.
- **Safety:** Implement limits on `limit` to prevent excessive memory/CPU usage.
- **Consistency:** Follow `code-base.md` naming and structural conventions.

## Verification
- Unit tests for service and repository methods.
- Integration tests for the new route.
- Manual verification via `curl` or similar tool.

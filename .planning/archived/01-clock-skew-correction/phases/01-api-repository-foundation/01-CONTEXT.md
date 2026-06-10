# Phase 1: API & Repository Foundation - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the foundational backend changes required for sliding-window paging in Topo-Tracer. This includes updating the API type definitions, the Repository interface contract, and the ClickHouse implementation to support offset-based node retrieval with probing for "next/previous" pages.

</domain>

<decisions>
## Implementation Decisions

### Cursor Representation
- **D-01: Opaque Format:** Paging cursors will be exposed to the client as Base64 encoded opaque strings.
- **D-02: Initial Page:** Clients request the first page by omitting the `cursor` parameter (Null/Optional).
- **D-03: Version Safety:** The cursor will include the `materializedAt` timestamp of the trace. If a client pages using a cursor from a stale materialization run, the backend will return a `409 Conflict` error, prompting a full trace refresh.

### Paging Metadata Shape
- **D-04: Nesting:** Paging metadata (cursors and flags) will reside in a nested `metadata.paging` object in the graph response.
- **D-05: Descriptive Keys:** Metadata will use clear, descriptive keys: `nextCursor`, `previousCursor`, `hasAfter`, `hasBefore`.
- **D-06: Total Count:** The response will include `totalNodeCount` to help the UI render progress bars or accurate scroll indicators.
- **D-07: Window Bounds:** The `metadata.paging` object will also include `fromFlowOrder` and `toFlowOrder` to describe the range of the current window.

### Repository Interface
- **D-08: Unified Parameters:** Repository methods will accept a structured `PagingParams` object containing `offset` (number) and `limit` (number).
- **D-09: Result Wrapper:** Repository methods will return a `PagedResult<T>` wrapper that includes the fetched data plus basic paging indicators (e.g., `hasMore`).
- **D-10: Method Updates:** Existing methods `loadBoundedProjectionNodes` and `loadBoundedVisibleNodes` (importance-filtered) will both be updated to support paging.

### Boundary Logic
- **D-11: Graceful OOR:** Requests for an offset completely beyond the trace size will return an empty nodes array with `hasAfter: false` rather than an error.
- **D-12: Max Limit Enforcement:** If a client requests a `limit` exceeding the system hard cap (1000), the server will silently cap it to the maximum.
- **D-13: Malformed Input:** Cursors that cannot be decoded or are malformed will result in a `400 Bad Request`.

### Claude's Discretion
- Claude has discretion over the exact internal serialization format of the opaque cursor (e.g., `flowOrder:timestamp`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Contracts
- `hono-server/src/services/log/api/types.ts` — API response structures and shared types.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` — Repository interface definitions.

### Implementations
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` — Existing ClickHouse read logic.

### Design
- `docs/TRACE_DESIGN.md` — Original graph projection and 500-node cap design.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DEFAULT_PROJECTION_NODE_CAP`: Existing constant in `ILogReadRepo.ts` to be used as the default window size.

### Established Patterns
- `argMax` aggregation: Used in ClickHouse queries to handle ReplacingMergeTree records without `FINAL`.
- `tuple` based inequality: Used in `loadRawEventsAfterCheckpoint` to query beyond a specific point; a similar pattern will be used for `flow_order >= {offset}`.

### Integration Points
- `ILogReadRepo`: The primary point of extension for backend data retrieval.

</code_context>

<specifics>
## Specific Ideas
- No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas
- Bi-directional paging (paging backwards from a specific end point) is out of scope for this phase.
- Complex ghosting at window boundaries (splitting a ghost node across windows) is out of scope.
</deferred>

---

*Phase: 1-API & Repository Foundation*
*Context gathered: 2026-06-08*

# Phase 2: Service-Level Projection - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements the service-level orchestration and metadata calculation for sliding-window paging. It focuses on updating `LogServiceImpl` to handle cursor decoding, repository coordination, and the assembly of the `ProjectedGraphMetadata` (including `hasBefore`, `hasAfter`, and cursors).

</domain>

<decisions>
## Implementation Decisions

### Paging Orchestration
- **D-14: Logic Location:** `LogServiceImpl` will handle the primary paging logic, including cursor decoding/encoding and metadata assembly. `LogGraphProjector` remains focused on graph transformation and threshold filtering.
- **D-15: Threshold Resilience:** If a user changes the importance threshold while paging, the current `offset` (topological position) is preserved. The system does NOT reset to the start of the trace.

### Metadata Calculation
- **D-16: Backward Navigation:** The `previousCursor` will be calculated using simple offset subtraction: `max(0, currentOffset - currentLimit)`.
- **D-17: Window Range:** The `fromFlowOrder` and `toFlowOrder` fields will reflect the actual `flowOrder` values of the first and last nodes returned in the window.
- **D-18: Empty Window Handling:** If a window returns zero nodes, both `fromFlowOrder` and `toFlowOrder` will be set to `null` or `0` to signal an empty state.
- **D-19: hasBefore Flag:** `hasBefore` is simply `offset > 0`.

### Claude's Discretion
- Claude has discretion over the exact private helper methods in `LogServiceImpl` used to clean up the metadata assembly code.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Contracts
- `hono-server/src/services/log/api/types.ts` — Paging and Metadata type definitions (updated in Phase 1).
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` — Updated repository signatures.

### Implementations
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` — Target for orchestration logic.
- `hono-server/src/services/log/internal/util/CursorCodec.ts` — Utility for cursor transformation.

### Prior Context
- `.planning/phases/01-api-repository-foundation/01-CONTEXT.md` — Foundation decisions (opaque cursors, version safety).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CursorCodec`: Use this for all B64 cursor transformations.

### Integration Points
- `LogServiceImpl.projectTraceGraph`: The primary method to be updated. It currently enforces a hard 500-node cap by ignoring further data; this needs to transition to a windowed fetch.

</code_context>

<specifics>
## Specific Ideas
- No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas
- Phase 1 deferred ideas (bi-directional paging, complex ghosting) remain deferred.
</deferred>

---

*Phase: 2-Service-Level Projection*
*Context gathered: 2026-06-08*

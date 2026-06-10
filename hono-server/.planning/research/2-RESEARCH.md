# Phase 2: Service Layer Refinement - Research

**Researched:** 2024-05-24
**Domain:** Trace Graph Projection & Pagination
**Confidence:** HIGH

## Summary

Phase 2 focuses on verifying and refining the service-level logic for the `/flow` endpoint. The primary mechanism for this endpoint is the existing `LogServiceImpl.projectTraceGraph` method, which implements a "Summary-First" projection strategy. This strategy fetches a fixed window of raw nodes (sorted topologically by `flowOrder`) and then collapses nodes exceeding the importance threshold into "Ghost Nodes" using the `LogGraphProjector`.

Our investigation confirms that the existing implementation in `LogServiceImpl`, `LogGraphProjector`, and `LogReadRepoClickHouse` is already well-aligned with the requirements for the `/flow` endpoint. It supports threshold-based filtering, deterministic pagination via `flowOrder`, and strict consistency via materialization-aware cursors.

**Primary recommendation:** Reuse `LogServiceImpl.projectTraceGraph` without modification. The existing 1000-node safety cap and 409 Conflict logic for stale cursors are sufficient and correct.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Default Threshold Handling: ROUTE-LEVEL DEFAULTS**
  - The `ILogService.projectTraceGraph` signature will remain strict (requiring `threshold: number`). The default value of `0` (Summary First) will be applied at the **Route handler level** in Phase 3.
- **Validation Scope: INTEGRATION-FOCUSED**
  - No new service-layer unit tests will be added specifically for "flow" behavior. Verification will be handled via **Integration Tests** in Phase 3.

### the agent's Discretion
- None specified (Implementation details for Phase 2 were mostly about verification of existing logic).

### Deferred Ideas (OUT OF SCOPE)
- None specified.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-04 | Refine `LogServiceImpl.projectTraceGraph` | Verified existing logic supports pagination, thresholding, and ghosting. |
| REQ-05 | Ensure `CursorCodec` handles state | Confirmed `offset:materializedAt` format provides strict consistency. |
| REQ-06 | Verify service-level error handling | Confirmed `ConflictError` (409) is thrown for stale cursors. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Threshold Filtering | API (CPU) | — | `LogGraphProjector` handles ghosting logic in-memory after fetching raw nodes. |
| Pagination | API (DB) | — | `LogReadRepo` handles `offset/limit` using `flowOrder` in ClickHouse. |
| Consistency Check | API (Service) | — | `LogServiceImpl` compares cursor `materializedAt` with latest trace summary. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.0.0 | API Framework | Project standard for lightweight, fast routing. |
| ClickHouse | Latest | Analytical Store | Used for read-optimized trace materialization. |
| tslog | ^4.9.0 | Logging | Structured logging across the codebase. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `CursorCodec` | Internal | Opaque Paging | Used for encoding/decoding Base64 cursors. |

## Package Legitimacy Audit

No new external packages are required for this phase. All required libraries are already present in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── common/
│   └── types.ts        # ConflictError definition
└── services/
    └── log/
        ├── api/
        │   └── types.ts # ProjectedGraphResult
        ├── internal/
        │   ├── projection/
        │   │   └── LogGraphProjector.ts # Ghosting logic
        │   ├── repo/
        │   │   └── impl/
        │   │       └── LogReadRepoClickHouse.ts # Paging queries
        │   ├── service-impl/
        │   │   └── LogServiceImpl.ts # Coordination
        │   └── util/
        │       └── CursorCodec.ts # Cursor encoding/decoding
```

### Pattern: Summary-First Projection
**What:** Fetch a raw slice of nodes by topological order (`flowOrder`) and then summarize.
**When to use:** When you need a stable window of a trace that might have thousands of nodes, but the user only wants to see high-importance ones.
**Example:**
```typescript
// From LogServiceImpl.ts
const boundedNodes = await this.readRepo.loadBoundedProjectionNodes({
  userId,
  traceId,
  paging: { offset, limit },
});
const result = await this.projector.project({
  threshold,
  nodes: boundedNodes.items,
  // ...
});
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph Layouting | Custom CSS/JS | Client-side Library | The server only provides nodes and edges; UI layout is a complex frontend concern. |
| Topological Sort | DB-side recursion | `flowOrder` column | ClickHouse is poor at recursion; `flowOrder` is pre-computed during materialization. |

## Common Pitfalls

### Pitfall 1: Cursor Stale-ness
**What goes wrong:** User pages through a trace that is being actively re-materialized.
**How to avoid:** Always include `materializedAt` in the cursor and check it against the latest summary.
**Warning signs:** `ConflictError` thrown from `LogServiceImpl`.

### Pitfall 2: Excessive Edge Fetching
**What goes wrong:** Fetching all edges for a large trace window can overwhelm memory.
**How to avoid:** Use `DEFAULT_PROJECTION_EDGE_CAP` (2000) and cap edges to those connecting visible nodes.

## Code Examples

### Stale Cursor Detection
```typescript
// Source: src/services/log/internal/service-impl/LogServiceImpl.ts
if (cursor) {
  const decoded = decodeCursor(cursor);
  if (decoded.materializedAt !== summary.materializedAt) {
    throw new ConflictError(
      `Cursor is stale. Cursor refers to materialization at ${decoded.materializedAt}, but latest is ${summary.materializedAt}. Please refresh.`
    );
  }
  offset = decoded.offset;
}
```

### Ghost Node ID Generation
```typescript
// Source: src/services/log/internal/projection/LogGraphProjector.ts
const ghostId = `ghost:${traceId}:${threshold}:${flowOrderStart}:${flowOrderEnd}`;
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `threshold` change mid-pagination is acceptable. | Summary | Minimal; sliding window of nodes remains stable. |
| A2 | Integration tests in Phase 3 are sufficient. | Summary | Service logic is already unit-tested; integration tests will cover wiring. |

## Open Questions (RESOLVED)

1. **Should `threshold` be in the cursor?**
   - **RESOLVED:** Current implementation: No. Recommendation: Keep it out for now to allow flexible threshold adjustment within a paged window, as long as `materializedAt` ensures data stability.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ClickHouse | Data Layer | ✓ | - | - |
| Bun | Runtime | ✓ | 1.1.7 | - |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun Test |
| Config file | none |
| Quick run command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-04 | Logic Reused | Unit | `bun test src/services/log/internal/service-impl/LogServiceImpl.test.ts` | ✅ |
| REQ-05 | Cursor State | Unit | `bun test src/services/log/internal/util/CursorCodec.test.ts` | ✅ |
| REQ-06 | Stale Cursor Error | Unit | `bun test src/services/log/internal/service-impl/LogServiceImpl.test.ts` | ✅ |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `zod` validation in Route Handler (Phase 3) |

### Known Threat Patterns for Trace Flow

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Resource Exhaustion | Denial of Service | `MAX_PROJECTION_NODE_CAP` (1000) safety ceiling. |

## Sources

### Primary (HIGH confidence)
- `src/services/log/internal/service-impl/LogServiceImpl.ts`
- `src/services/log/internal/util/CursorCodec.ts`
- `src/services/log/internal/projection/LogGraphProjector.ts`
- `src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Core project stack.
- Architecture: HIGH - Verified against existing implementation.
- Pitfalls: HIGH - Based on existing error handling and caps.

**Research date:** 2024-05-24
**Valid until:** 2024-06-24

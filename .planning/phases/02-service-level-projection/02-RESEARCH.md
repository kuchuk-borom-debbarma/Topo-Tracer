# Phase 2: Service-Level Projection - Research

**Researched:** 2026-06-08
**Domain:** Service orchestration, metadata calculation, cursor management.
**Confidence:** HIGH

## Summary

This research defines the implementation strategy for Phase 2: Service-Level Projection. The primary responsibility of this phase is to update `LogServiceImpl` to orchestrate sliding-window paging, handle cursor transformations, and calculate the necessary paging metadata for the frontend.

Key discoveries include the need for a new `loadTraceSummary` method in the repository to support efficient version safety checks (409 Conflict) and the specific logic for calculating `previousCursor` and `nextCursor` based on the requested window.

**Primary recommendation:** Update `LogServiceImpl.projectTraceGraph` to handle opaque cursor decoding/encoding and implement a strict version check against the trace summary's `materializedAt` timestamp.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cursor Decoding/Encoding | API / Backend | — | `LogServiceImpl` owns the transformation between opaque UI cursors and internal offsets. |
| Metadata Assembly | API / Backend | — | Calculating `hasBefore`, `hasAfter`, and relative cursors belongs in the service orchestration layer. |
| Version Verification | API / Backend | — | The service layer enforces consistency by checking cursor timestamps against the latest materialization summary. |
| Windowed Data Retrieval | Database | API / Backend | ClickHouse performs the heavy lifting of offset-based filtering; `ILogReadRepo` provides the interface. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `LogServiceImpl` | N/A | Orchestration | Central coordinator for trace workflows. |
| `CursorCodec` | N/A | Utilities | Standardizes Base64 cursor format: `offset:materializedAt`. |
| `LogGraphProjector` | N/A | Local Projection | Handles ghost node creation and edge aggregation. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ILogReadRepo` | N/A | Data Abstraction | Used to fetch nodes, edges, and summaries. |

**Installation:**
No new packages required.

## Package Legitimacy Audit

No external packages installed in this phase.

## Architecture Patterns

### Recommended Project Structure
The structure remains as defined in the project baseline:
```
hono-server/src/services/log/
├── api/
│   └── types.ts             # Metadata and Paging types
├── internal/
│   ├── service-impl/
│   │   └── LogServiceImpl.ts # TARGET: Orchestration logic
│   ├── projection/
│   │   └── LogGraphProjector.ts
│   └── util/
│       └── CursorCodec.ts    # TARGET: Encoding/Decoding
```

### Pattern 1: Opaque Cursor Transformation
The UI should never deal with raw `flowOrder` offsets. The service layer wraps these in a Base64 string along with a materialization timestamp.

**Example:**
```typescript
// Source: hono-server/src/services/log/internal/util/CursorCodec.ts
export function encodeCursor(offset: number, materializedAt: number): string {
  return Buffer.from(`${offset}:${materializedAt}`).toString("base64");
}
```

### Anti-Patterns to Avoid
- **Raw Offset Exposure:** Do not return `offset` as a number to the client. It makes the API brittle and prevents future changes to the paging implementation (e.g., moving to keyset paging).
- **Ignoring Materialization Version:** Paging into a trace that has been re-materialized with different topological sorting will result in "missing" or "duplicate" nodes in the UI. Always verify `materializedAt`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor Formatting | Custom concatenation | `CursorCodec` | Centralizes the B64 format and error handling for malformed strings. |
| Graph Paging | Manual slice/filter | ClickHouse `LIMIT` | DB-level filtering is significantly faster and prevents memory bloat in the API tier. |

## Common Pitfalls

### Pitfall 1: Empty Window Metadata
**What goes wrong:** If a trace has 100 nodes and a user requests offset 200, the repo returns an empty array.
**Why it happens:** Out-of-bounds requests.
**How to avoid:** Ensure `fromFlowOrder` and `toFlowOrder` return `0` (or `null`) and `hasAfter` is `false`.
**Warning signs:** UI showing `NaN` or `undefined` in range indicators.

### Pitfall 2: Stale Cursor Conflict
**What goes wrong:** User pages forward, the trace is updated in the background, the user pages forward again.
**Why it happens:** Topological order (`flowOrder`) can change when new events are materialized.
**How to avoid:** Throw a `409 Conflict` if the cursor's `materializedAt` doesn't match the current summary.

## Code Examples

### Metadata Assembly Pattern
```typescript
// Proposed logic for LogServiceImpl.ts
const currentMaterializedAt = summary.materializedAt;
const hasAfter = boundedNodes.hasMore;
const hasBefore = offset > 0;

const result: ProjectedGraphResult = {
  // ... nodes/edges ...
  metadata: {
    // ... existing counts ...
    paging: {
      nextCursor: hasAfter ? encodeCursor(offset + limit, currentMaterializedAt) : null,
      previousCursor: hasBefore ? encodeCursor(Math.max(0, offset - limit), currentMaterializedAt) : null,
      hasAfter,
      hasBefore,
      totalNodeCount: boundedNodes.totalCount,
      fromFlowOrder: boundedNodes.items[0]?.flowOrder ?? 0,
      toFlowOrder: boundedNodes.items[boundedNodes.items.length - 1]?.flowOrder ?? 0,
    }
  }
};
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ILogReadRepo` will be extended with `loadTraceSummary`. | Code Examples | Small: `loadLatestReadModel` can be used as a fallback but is less efficient. |

## Open Questions (RESOLVED)

1. **Conflict Error Handling: (RESOLVED)** Should the `409 Conflict` be a custom Error class or a standard Hono/HTTP exception? 
   - *Recommendation:* Use a custom `ConflictError` that the route handler can map to `409`. (Resolution: Logic will throw a `ConflictError` class).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ClickHouse | Data layer | ✓ | 23.x | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun Test |
| Config file | none |
| Quick run command | `bun test hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR1 | Fetch subset of nodes based on offset/limit | integration | `bun test ... -x` | ✅ |
| FR2 | Metadata contains flags and cursors | integration | `bun test ... -x` | ✅ |
| TR2 | Limit + 1 probing for hasAfter | integration | `bun test ... -x` | ✅ |
| D-03 | 409 Conflict on stale cursor | integration | `bun test ... -x` | ✅ |
| D-16 | Backward navigation calculation | integration | `bun test ... -x` | ✅ |

### Wave 0 Gaps
- [ ] Add `loadTraceSummary` to `FakeLogReadRepo` in `LogServiceImpl.test.ts`.
- [ ] Implement `409 Conflict` test case.
- [ ] Implement `400 Malformed Cursor` test case.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `cursor` is valid Base64 and contains expected parts before processing. |

### Known Threat Patterns for Node.js/Hono

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Resource Exhaustion | Denial of Service | Enforce `limit` cap (1000) in the service layer regardless of client request. |

## Sources

### Primary (HIGH confidence)
- `hono-server/src/services/log/internal/util/CursorCodec.ts` - Verified Base64 implementation.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` - Verified `limit + 1` and `hasMore` logic.
- `02-CONTEXT.md` - Verified paging metadata requirements.

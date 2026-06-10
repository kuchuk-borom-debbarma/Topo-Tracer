# Phase 1: API & Repository Foundation - Research

**Researched:** 2025-06-08
**Domain:** Durable Graph Window Paging (API & Repository)
**Confidence:** HIGH

## Summary

This phase establishes the foundational types and repository contracts for "Durable Graph Window Paging". We are moving from a simple 500-node safety cap to a sliding-window paging model using opaque Base64 cursors. The implementation ensures that clients can safely page through large traces even if the trace is re-materialized, by including a versioning timestamp (`materializedAt`) in the cursor.

**Primary recommendation:** Use `flow_order >= {offset}` in ClickHouse for stable topological paging, and return a `PagedResult` from the repository that includes `totalNodeCount` derived from a window function or subquery to ensure UI progress indicators remain accurate.

<user_constraints>
## User Constraints (from 01-CONTEXT.md)

### Locked Decisions
- **Cursor Representation:**
  - Opaque B64 cursors with `materializedAt` timestamp.
  - Initial page requested by omitting `cursor`.
  - 409 Conflict for stale timestamps.
- **Paging Metadata Shape:**
  - Nested `metadata.paging` object.
  - Keys: `nextCursor`, `previousCursor`, `hasAfter`, `hasBefore`, `totalNodeCount`, `fromFlowOrder`, `toFlowOrder`.
- **Repository Interface:**
  - `PagingParams { offset, limit }`.
  - `PagedResult<T>` wrapper.
  - Update `loadBoundedProjectionNodes` and `loadBoundedVisibleNodes`.
- **Boundary Logic:**
  - Graceful empty result for out-of-bounds.
  - Silent cap at 1000.
  - 400 Bad Request for malformed cursors.

### the agent's Discretion
- Internal serialization format of the opaque cursor (recommended: `offset:materializedAt`).

### Deferred Ideas (OUT OF SCOPE)
- Bi-directional paging.
- Complex ghosting at window boundaries.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-01 | Update `types.ts` with paging structures | Verified existing structures and identified injection points for `metadata.paging`. |
| REQ-02 | Update `ILogReadRepo` contract | Designed `PagingParams` and `PagedResult` to align with D-08/D-09. |
| REQ-03 | Implement ClickHouse paging logic | Proposed SQL using `flow_order >= {offset}` and `count(*) OVER()`. |
| REQ-04 | Implement Cursor codec | Designed B64 serialization logic with version safety (D-03). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cursor Codec | API / Backend | — | Handles B64 (un)marshaling and version validation logic. |
| Paging Parameter Validation | API / Backend | — | Ensures `offset` and `limit` are within safe bounds (D-12). |
| Data Windowing | Database (ClickHouse) | — | Efficiently filters and slices nodes using `flow_order`. |
| Paging Metadata Assembly | API / Backend | — | Combines DB results with cursor logic to build the response. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@clickhouse/client-web` | ^1.19.0 | Database Client | Existing standard for ClickHouse interaction in `hono-server`. |
| `Buffer` / `btoa` | Native | Cursor Encoding | Standard Node/Bun APIs for Base64. |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@clickhouse/client-web` | npm | 2 yrs | 35k/wk | github.com/ClickHouse/clickhouse-js | [OK] | Approved |
| `hono` | npm | 3 yrs | 1.2M/wk | github.com/honojs/hono | [OK] | Approved |
| `tslog` | npm | 4 yrs | 200k/wk | github.com/tslog-org/tslog | [OK] | Approved |

## Architecture Patterns

### Cursor Serialization Logic
The opaque cursor will follow the pattern `offset:materializedAt`.

**Encoding:**
```typescript
function encodeCursor(offset: number, materializedAt: number): string {
  return Buffer.from(`${offset}:${materializedAt}`).toString('base64');
}
```

**Decoding:**
```typescript
function decodeCursor(cursor: string): { offset: number; materializedAt: number } {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [offsetStr, materializedAtStr] = decoded.split(':');
    const offset = parseInt(offsetStr, 10);
    const materializedAt = parseInt(materializedAtStr, 10);
    if (isNaN(offset) || isNaN(materializedAt)) throw new Error("Malformed");
    return { offset, materializedAt };
  } catch (e) {
    throw new Error("400 Bad Request: Malformed cursor");
  }
}
```

### SQL Changes (ClickHouse)
To support stable paging and total count reporting, the queries in `LogReadRepoClickHouse.ts` will be updated to use a window function for the total count and a `WHERE` clause for the window start.

**Pattern for `loadBoundedVisibleNodes`:**
```sql
SELECT 
  *, 
  count(*) OVER() as total_node_count 
FROM (
  SELECT 
    id,
    argMax(importance_level, materialized_at_ms) as importance_level,
    argMax(flow_order, materialized_at_ms) as flow_order,
    -- ... other fields ...
    max(materialized_at_ms) as materialized_at_ms
  FROM ${CLICKHOUSE_READ_NODES_TABLE}
  WHERE user_id = {userId:String} AND trace_id = {traceId:String}
  GROUP BY id
)
WHERE importance_level <= {threshold:Int32}
  AND flow_order >= {offset:UInt32} -- Sliding window start
ORDER BY flow_order ASC, id ASC
LIMIT {limitPlusOne:UInt32} -- Probe for hasAfter
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side Paging | Hand-rolled slicing | Backend windowing | Memory safety. Traces can exceed 10k nodes; shipping all to frontend is not viable. |
| Cursor Integrity | Cryptographic signing | Opaque B64 + MaterializedAt check | Simplicity. We don't need tamper-proofing, only staleness detection. |

## Common Pitfalls

### Pitfall 1: Missing the `+1` Probe
**What goes wrong:** UI doesn't know if a "Next" button should be enabled.
**How to avoid:** Always request `limit + 1` from the database. If `results.length > limit`, then `hasAfter = true`.

### Pitfall 2: Stale Cursor vs. New Materialization
**What goes wrong:** Client uses a cursor from an old materialization run; `flowOrder` might have changed, leading to skipped or duplicated nodes.
**How to avoid:** Always include `materializedAt` in the cursor and verify it against the current summary in the API layer. Return `409 Conflict` if they mismatch.

## Code Examples

### Proposed Type Modifications in `types.ts`
```typescript
export type PagingParams = {
  offset: number;
  limit: number;
};

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  hasMore: boolean;
};

// Updated Metadata
export type ProjectedGraphMetadata = {
  // ... existing fields ...
  paging: {
    nextCursor: string | null;
    previousCursor: string | null;
    hasAfter: boolean;
    hasBefore: boolean;
    totalNodeCount: number;
    fromFlowOrder: number;
    toFlowOrder: number;
  };
};
```

### Proposed `ILogReadRepo` Interface Update
```typescript
abstract loadBoundedVisibleNodes(params: {
  userId: string;
  traceId: string;
  threshold: number;
  paging: PagingParams;
}): Promise<PagedResult<ReadNode>>;
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `flow_order` is 0 or 1-indexed and stable | SQL Changes | If it's not stable across materializations, cursors will be unreliable (mitigated by D-03). |
| A2 | ClickHouse `count(*) OVER()` is enabled | SQL Changes | Most modern ClickHouse installs have it. If not, fallback to `rows_before_limit_at_least`. |

## Open Questions (RESOLVED)

1. **How to calculate `previousCursor`? (RESOLVED)**
   - Recommendation: Since we only support forward paging for now (D-10), `previousCursor` can be calculated if the current `offset > 0`. However, bi-directional paging is deferred. We should still provide it if the client is at `offset > 0` by subtracting `limit`. (Resolution: Logic will subtract limit from offset if offset > 0).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ClickHouse | Data Layer | ✓ | 24.3 | — |
| Bun / Node | Runtime | ✓ | 1.1.x | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun Test |
| Quick run command | `bun test hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| REQ-03 | SQL includes `flow_order >= offset` | Unit | `bun test` (Check `fakeClient.queries`) |
| REQ-03 | Repository returns `PagedResult` | Unit | `bun test` (Verify return shape) |
| REQ-04 | Cursor codec handles B64 and version | Unit | Add new test file `CursorCodec.test.ts` |

### Wave 0 Gaps
- [ ] `hono-server/src/services/log/util/CursorCodec.ts` — New utility for encoding/decoding.
- [ ] `hono-server/src/services/log/util/CursorCodec.test.ts` — Tests for codec.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `offset` (min 0) and `limit` (max 1000). |

### Known Threat Patterns for ClickHouse

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL Injection | Tampering | Use `query_params` with the ClickHouse client (already used in project). |
| Resource Exhaustion | Denial of Service | Enforce hard cap of 1000 rows (D-12). |

## Sources

### Primary (HIGH confidence)
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` (Project Source)
- `01-CONTEXT.md` (Project Context)
- ClickHouse Official Docs (Window Functions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing project stack.
- Architecture: HIGH - Follows project patterns and explicit decisions.
- Pitfalls: MEDIUM - Based on common paging challenges.

**Research date:** 2025-06-08
**Valid until:** 2025-07-08

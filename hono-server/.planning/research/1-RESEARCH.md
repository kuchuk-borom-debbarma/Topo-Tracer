# Phase 1: Research & Interface Alignment - Research

**Researched:** 2025-05-24
**Domain:** Trace Flow Visualization & Pagination
**Confidence:** HIGH

## Summary

This research phase verified the readiness of the existing `ILogService`, `LogServiceImpl`, and `LogReadRepoClickHouse` components to support the new `/api/v1/traces/:traceId/flow` endpoint. The core strategy is to reuse the existing `projectTraceGraph` logic, which already handles topological sorting, threshold-based node collapsing (ghosting), and cursor-based pagination.

We found that while the implementation in `LogServiceImpl` and `LogReadRepoClickHouse` already supports the necessary pagination parameters, the abstract interface `ILogService` lacks these parameters in its signature. Aligning this interface is the primary surgical change required.

**Primary recommendation:** Update `ILogService.projectTraceGraph` to include `cursor` and `limit` parameters and then register the `/flow` route in `src/index.ts` reusing the service method.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route Handling | API (Hono) | — | Entry point for `/flow` requests. |
| Graph Projection | Log Service | LogGraphProjector | Service orchestrates reads; Projector handles CPU-bound collapsing rules. |
| Deterministic Paging | Log Repository | CursorCodec | Repository executes `flow_order` bounded queries; Codec handles opaque cursor serialization. |
| Materialization Checks | Log Service | — | Service enforces STRICT pagination by checking `materializedAt` in cursors. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.12.25 | Web Framework | Lightweight, fast, and used throughout the project. |
| ClickHouse | ^1.20.0 | Materialized Storage | Optimized for high-volume trace read models and analytical queries. |
| TinyQueue | 3.0.0 | Priority Queue | Used for Kahn's algorithm in topological sorting. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| CursorCodec | Internal | Pagination | Encodes `offset:materializedAt` for strict paging. |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| hono | npm | 3+ yrs | 1M+/wk | github.com/honojs/hono | [OK] | Approved |
| @clickhouse/client-web | npm | 1+ yr | 50k+/wk | github.com/ClickHouse/clickhouse-js | [OK] | Approved |
| tslog | npm | 4+ yrs | 100k+/wk | github.com/fullstack-build/tslog | [OK] | Approved |
| tinyqueue | npm | 8+ yrs | 1M+/wk | github.com/mourner/tinyqueue | [OK] | Approved |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/log/
│   ├── api/
│   │   ├── ILogService.ts       # Interface to be updated
│   │   └── types.ts             # Contains ProjectedGraphResult
│   ├── internal/
│   │   ├── service-impl/
│   │   │   └── LogServiceImpl.ts # Implementation (already has paging logic)
│   │   ├── projection/
│   │   │   └── LogGraphProjector.ts # Logic for ghost nodes
│   │   └── repo/
│   │       ├── ILogReadRepo.ts
│   │       └── impl/
│   │           └── LogReadRepoClickHouse.ts # ClickHouse paging logic
```

### Pattern 1: Deterministic Topological Paging
**What:** Uses `flow_order` (computed during materialization) as a stable offset for paging.
**When to use:** When viewing graphs that have a logical sequence or causal order.
**Example:**
```typescript
// From LogReadRepoClickHouse.ts
query: `
  SELECT * FROM read_nodes
  WHERE user_id = {userId:String} AND trace_id = {traceId:String}
  AND flow_order >= {offset:UInt32}
  ORDER BY flow_order ASC, id ASC
  LIMIT {limit:UInt32}
`
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Topological Sort | Custom DFS | `computeFlowOrder` | Already implemented using Kahn's algorithm with cycle detection and priority queue for stable sorting. |
| Paging Logic | Basic `OFFSET` | `flow_order` filter | ClickHouse `OFFSET` is slow; `flow_order` filtering is deterministic and faster. |
| Ghost Node IDs | Random IDs | Deterministic hashes | Ensures ghost nodes are stable across paging requests. |

## Common Pitfalls

### Pitfall 1: Stale Paging Cursors
**What goes wrong:** User pages through a trace while it's being re-materialized, leading to duplicate or missing nodes.
**How to avoid:** Enforce `ConflictError` if the cursor's `materializedAt` timestamp doesn't match the current trace summary. (Already implemented in `LogServiceImpl`).

## Code Examples

### Interface Update (GSD Phase 1 target)
```typescript
// src/services/log/api/ILogService.ts
abstract projectTraceGraph(data: {
  userId: string;
  traceId: string;
  threshold: number;
  cursor?: string;   // Add this
  limit?: number;    // Add this
}): Promise<ProjectedGraphResult>;
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `/flow` and `/graph` should return identical data structures. | Summary | Low - Both visualize trace segments, same structure is preferred for client consistency. |
| A2 | Threshold 0 is a sensible default for the flow view. | Summary | Low - This is a product decision documented in CONTEXT.md. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ClickHouse | Data Storage | ✓ | 23.x+ | — |
| Node/Bun | Runtime | ✓ | Bun 1.x | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun Test |
| Config file | none |
| Quick run command | `bun test src/services/log/internal/service-impl/LogServiceImpl.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-01 | `GET /api/v1/traces/:traceId/flow` exists | Integration | `bun test` (after implementation) | ❌ Wave 0 |
| REQ-03 | Correct mapping of query params | Unit | `bun test src/services/log/internal/service-impl/LogServiceImpl.test.ts` | ✅ |
| REQ-05 | ClickHouse pagination usage | Unit | `bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | ✅ |

### Wave 0 Gaps
- [ ] `src/index.test.ts` (or similar) — needs new tests for the `/flow` route specifically.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `jwtAuthMiddleware` ensuring `userId` matches trace owner. |
| V5 Input Validation | yes | Strict typing and `Number()` conversion for query params. |

### Known Threat Patterns for Hono/ClickHouse

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Insecure Direct Object Reference (IDOR) | Information Disclosure | Always filter queries by `user_id` in addition to `trace_id`. |
| SQL Injection | Tampering | Use ClickHouse `query_params` for all user-supplied values. |

## Sources

### Primary (HIGH confidence)
- `src/services/log/api/ILogService.ts`
- `src/services/log/internal/service-impl/LogServiceImpl.ts`
- `src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`
- `.planning/1-CONTEXT.md`

## Open Questions (RESOLVED)

1. **Does the abstract interface strictly need to match the implementation for Hono?**
   - **Answer:** Yes, for type safety and contract-first integrity as defined in `code-base.md`.
2. **Are there any hidden costs to reusing `projectTraceGraph`?**
   - **Answer:** No, the implementation is already optimized and tested for the required pagination and thresholding behaviors.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified via codebase and package.json.
- Architecture: HIGH - Verified via source code analysis.
- Pitfalls: HIGH - Verified via existing implementation and tests.

**Research date:** 2025-05-24
**Valid until:** 2025-06-24

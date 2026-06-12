# Phase 1: Shared API & Database Schema - Research

**Researched:** 2024-10-24
**Domain:** Backend API, Database Schema (ClickHouse), Ingestion Pipeline
**Confidence:** HIGH

## Summary

This phase focuses on introducing optional trace names into the system. Trace names are SDK-driven and arrive at the ingestion layer via the root node's start event. The research confirms that the system uses a direct DDL-in-code approach for ClickHouse schema management and follows a strict snake_case (DB) to camelCase (API) mapping pattern.

**Primary recommendation:** Update the ClickHouse schema using idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements and propagate the `traceName` field through the ingestion and read-model layers using `coalesce(name, trace_id)` at the SQL level for the "DB-side fallback" requirement.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ingestion API | API / Backend | — | Receives `traceName` from SDK, validates, and hands to repository. |
| Persistence | Database / Storage | — | `node_events` stores the raw `trace_name`. |
| Real-time Aggregation | Database / Storage | — | `node_events_summary_mv` propagates the name to `trace_summaries_realtime`. |
| Materialization | API / Backend | Database | Worker-side `TraceReadModelMaterializer` propagates name to `trace_summaries`. |
| Read Model | Database / Storage | API / Backend | Provides name with fallback to `trace_id` for UI listing and detail. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ClickHouse | Latest (21.6+) | Database | Primary storage for high-volume telemetry. |
| Hono | 4.x | API Framework | Fast, multi-runtime TypeScript framework. |
| @clickhouse/client-web | 0.4.0 | DB Client | Official ClickHouse client for web/worker runtimes. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| tslog | 4.x | Logging | Standard logger used throughout the backend. |

## Package Legitimacy Audit

No new external packages are required for this phase. All changes are confined to existing infrastructure.

## Architecture Patterns

### Recommended Project Structure
```
hono-server/
├── src/
│   ├── infra/db/clickhouse/
│   │   └── schema.ts           # [Update] DDL statements
│   └── services/log/
│       ├── api/types.ts        # [Update] IngestNodeStart & ReadTraceSummary
│       └── internal/
│           ├── materialization/
│           │   └── TraceReadModelMaterializer.ts # [Update] Propagate name to summary
│           └── repo/
│               ├── types.ts    # [Update] Row types
│               └── impl/
│                   ├── LogWriteRepoClickHouse.ts # [Update] Write trace_name
│                   └── LogReadRepoClickHouse.ts  # [Update] Read name with fallback
```

### Pattern 1: Idempotent Schema Migration
Since the project lacks a formal migration system, use `IF NOT EXISTS` for both `CREATE` and `ALTER` statements to ensure bootstrapping remains idempotent.

```sql
-- Source: ClickHouse Official Docs (https://clickhouse.com/docs/en/sql-reference/statements/alter/column)
ALTER TABLE node_events ADD COLUMN IF NOT EXISTS trace_name Nullable(String) 
COMMENT 'Optional SDK-provided name for the trace' AFTER trace_id;
```

### Anti-Patterns to Avoid
- **Hand-rolling Fallback in UI:** The "DB-side fallback" requirement means the backend (SQL/Repo) must ensure the `name` field is always populated (with `trace_id` as fallback) before reaching the frontend.
- **Dropping Tables:** Do not use `DROP TABLE` in production-bound migrations; use `ALTER TABLE` to preserve existing telemetry data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Null handling in listing | Custom JS mapping | `coalesce(name, trace_id)` | More efficient to handle at the SQL level during aggregation. |
| Schema Versioning | Manual tracker | `IF NOT EXISTS` | Simple and effective for current project scale. |

## Common Pitfalls

### Pitfall 1: Materialized View Out-of-Sync
**What goes wrong:** Adding a column to the destination table of an MV doesn't update the MV query itself.
**Why it happens:** MVs in ClickHouse are essentially triggers; the `SELECT` query in the MV is fixed at creation time.
**How to avoid:** The `node_events_summary_mv` must be dropped and recreated to include the new `trace_name` mapping.

### Pitfall 2: Nullable Aggregate Functions
**What goes wrong:** `SimpleAggregateFunction(any, String)` will fail if the input is `Nullable(String)`.
**How to avoid:** Use `SimpleAggregateFunction(any, Nullable(String))` in the realtime summary table.

## Code Examples

### ClickHouse Alter Statements
```typescript
// hono-server/src/infra/db/clickhouse/schema.ts
export const CLICKHOUSE_MIGRATE_ADD_TRACE_NAME = `
  ALTER TABLE node_events ADD COLUMN IF NOT EXISTS trace_name Nullable(String) AFTER trace_id;
`;
// Add to CLICKHOUSE_SCHEMA_STATEMENTS array
```

### Repository Mapping (Write)
```typescript
// LogWriteRepoClickHouse.ts
...nodeStarts.map((node): NodeEventRow => ({
  ...
  trace_id: node.traceId,
  trace_name: node.traceName ?? null, // Propagation
  ...
}))
```

### Repository Mapping (Read with Fallback)
```typescript
// LogReadRepoClickHouse.ts
// In SQL:
// argMax(coalesce(s.name, s.trace_id), s.materialized_at_ms) as name
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `trace_id` only | SDK-driven `trace_name` | Phase 1 | Improves readability in the Trace List. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `anyIf` is best for MV name extraction | MV Updates | Might pick a non-root name if multiple nodes provide names (unlikely). |
| A2 | ClickHouse version supports `ADD COLUMN IF NOT EXISTS` | Schema Migration | Migration might fail on very old ClickHouse versions (<21.6). |

## Open Questions (RESOLVED)

1. **Root Node Enforcement:** Should the system only accept `traceName` from the root node (node with no parent), or any node? 
   - **Resolution (D-07):** The SDK should ideally only send `traceName` with the root span. However, for backend robustness, the Materializer (Phase 2) will pick the first non-null `trace_name` it encounters in the event stream for a given `trace_id`. For Phase 1, the schema simply allows storing it on any node event.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ClickHouse | Database | ✓ | 23.x (Assumed) | — |
| Hono | API | ✓ | 4.x | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun Test |
| Quick run command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-01 | `trace_name` in `node_events` | Integration | `bun test schema.test.ts` | ✅ |
| REQ-02 | `name` in summaries | Integration | `bun test schema.test.ts` | ✅ |
| REQ-03 | Ingestion propagates name | Unit | `bun test LogWriteRepo.test.ts` | ✅ |
| REQ-04 | Read Model returns fallback | Unit | `bun test LogReadRepo.test.ts` | ✅ |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | `IngestNodeStart` fields must be validated. |

### Known Threat Patterns for ClickHouse

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL Injection | Tampering | Use parameterized queries via `@clickhouse/client-web`. |

## Sources

### Primary (HIGH confidence)
- `hono-server/src/infra/db/clickhouse/schema.ts` - Verified DDL structure.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` - Verified query patterns.

### Secondary (MEDIUM confidence)
- ClickHouse Documentation - `ADD COLUMN IF NOT EXISTS` syntax.

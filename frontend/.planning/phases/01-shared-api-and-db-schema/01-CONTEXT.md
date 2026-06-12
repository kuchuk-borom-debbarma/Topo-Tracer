# Phase 1 Context: Shared API & Database Schema

## Domain
Phase 1 delivers the structural updates to the system's shared API and database schema to accommodate trace names. This includes updating the ClickHouse table definitions, the Hono-server API types used for ingestion and read-models, and the internal repository mappings.

## Decisions
### ClickHouse Schema
- **D-01: Column Naming**: 
  - Add `trace_name` (Nullable(String)) to `node_events`.
  - Add `name` (Nullable(String)) to `trace_summaries`.
  - Add `name` (SimpleAggregateFunction(any, Nullable(String))) to `trace_summaries_realtime`.
- **D-02: Materialized Views**: Update `node_events_summary_mv` to propagate the `trace_name` to the `name` column in `trace_summaries_realtime` by dropping and recreating the MV.
- **D-03: Read Models Schema**: Add `name` to `ReadTraceSummary`.

### API & Types
- **D-04: Ingestion API**: Add `traceName` (optional string) as a first-class field to `IngestNodeStart`.
- **D-05: Domain Types**: Add `name` to `ReadTraceSummary` (Backend) and `TraceSummary` (Frontend).

### Behavior
- **D-06: DB-side Fallback**: Queries in the repository layer MUST use `coalesce(name, trace_id)` to ensure a name is always returned to the UI.
- **D-07: Real-time Availability**: Trace names must be visible in the Trace List immediately via updates to the real-time summary table and its supporting Materialized Views.

## Canonical Refs
- `hono-server/src/infra/db/clickhouse/schema.ts` (Source of Truth for Schema)
- `hono-server/src/services/log/api/types.ts` (Source of Truth for API Types)
- `hono-server/src/services/log/internal/repo/types.ts` (Internal DB Mapping Types)

## Code Context
- `node_events` table in ClickHouse.
- `trace_summaries_realtime` table and its associated Materialized Views.
- `LogWriteRepoClickHouse.ts` and `LogReadRepoClickHouse.ts` for repository implementation.

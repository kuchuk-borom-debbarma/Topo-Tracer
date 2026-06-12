# Phase 1 Context: API & Schema Refactor

## Domain
Phase 1 delivers the structural updates to the ClickHouse schema and Hono API types to support dedicated trace start events and importance level labels.

## Decisions
### ClickHouse Schema
- **D-22: Trace Events Table**: Add `trace_events` table:
  - `user_id` String
  - `trace_id` String
  - `event_type` UInt8 (0 for Start)
  - `name` Nullable(String)
  - `importance_labels` Map(Int32, String)
  - `timestamp_ms` UInt64
- **D-23: Summary Labels**: Add `importance_labels` Map(Int32, String) to `trace_summaries`.
- **D-24: Schema Cleanup**: REMOVE `trace_name` column from `node_events` and its propagation to real-time summaries.
- **D-25: Real-time Scope**: Real-time summaries will NOT include importance labels (Materialized Only).

### Ingestion API
- **D-26: Trace Start Payload**: Add `IngestTraceStart` to `IngestBatch`:
  - `traceId` String
  - `name?` String
  - `importanceLabels?` Record<number, string>
  - `timestamp` number

### Read Model API
- **D-27: Summary Labels**: Add `importanceLabels` Record<number, string> to `ReadTraceSummary`.

## Canonical Refs
- `hono-server/src/infra/db/clickhouse/schema.ts` (Schema source)
- `hono-server/src/services/log/api/types.ts` (API source)

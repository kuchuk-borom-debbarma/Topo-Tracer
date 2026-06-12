# Summary - Phase 1, Plan 02 (Schema)

## Completed Tasks
- **Task 1: Update ClickHouse Schema and MV**: Added `trace_name` to `node_events`, and `name` to `trace_summaries`, `trace_summaries_realtime`, and `read_nodes`. Updated Materialized View to propagate `trace_name`.
- **Task 2: Update Repository Row Types**: (Completed previously) Added new fields to `NodeEventRow`, `TraceSummaryRow`, and `ReadNodeRow`.
- **Task 3: Update Schema Tests**: Verified that schema tests still pass with new column definitions.

## Key Changes
- Idempotent `ALTER TABLE` statements added to `CLICKHOUSE_SCHEMA_STATEMENTS`.
- `node_events_summary_mv` is now dropped and recreated during bootstrap to include the new column mapping.

## Verification Results
- `bun test hono-server/src/infra/db/clickhouse/schema.test.ts` passed.

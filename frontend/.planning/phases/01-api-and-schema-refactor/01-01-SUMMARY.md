# Summary - Phase 1, Plan 01 (API & Schema Refactor)

## Completed Tasks
- **Task 1: Update ClickHouse Schema definitions**: Added `trace_events` table (D-22), updated `trace_summaries` with `importance_labels` (D-23), and performed a "Clean Break" by removing deprecated `trace_name` and `name` columns from node and real-time summary tables (D-24, D-25).
- **Task 2: Update API Type definitions**: Added `IngestTraceStart` and `IngestBatch` containing `traceStarts` (D-26). Updated `ReadTraceSummary` to include `importanceLabels` (D-27).
- **Task 3: Update Internal Repository Types**: Added `TraceEventRow` and updated `TraceSummaryRow` and `ReadNodeRow` to match the new schema structure.

## Key Changes
- Shifted from span-attached metadata to a dedicated trace-level event system.
- Established support for configurable importance level labels.
- Performed schema cleanup to maintain high data quality and low technical debt.

## Verification Results
- ClickHouse schema constants are verified and idempotent.
- API and Repository types are updated, confirming the new structural contract.
- Expected type errors in implementation files (to be resolved in Phase 2 & 3) confirmed that the new mandatory fields and column removals are correctly enforced by the compiler.

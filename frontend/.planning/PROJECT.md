# Project: Trace Start Events & Importance Labels

## Context
Refactor the trace metadata implementation to use a dedicated 'Trace Start Event'. 
This provides a cleaner separation between trace-level attributes (name, importance labels) and span-level data.
This is a "Heavy Refactor" affecting the SDK, Ingestion API, ClickHouse Schema, and Materialization Logic.

## Scope
- New ClickHouse table: `trace_events` for high-level trace metadata.
- Updated Ingestion API: `IngestTraceStart` payload.
- SDK: Emit `TraceStart` when a trace begins.
- Backend: Propagate name and importance labels to read-optimized summaries.
- UI: Display importance level labels (e.g., "I0: DB", "I1: API").

## Technical Decisions
- **Clean Break**: Remove previous `trace_name` columns from `node_events`.
- **Rich Metadata**: Support configurable labels for importance levels (0-9).
- **Forward-only**: Old traces will not be backfilled.

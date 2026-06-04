---
phase: 03-checkpointed-materialization
plan: 03-01
subsystem: log
tags: [clickhouse, repository, materialization, checkpoint]
requirements: [MAT-02, MAT-03, MAT-04, MAT-06, MAT-07, MAT-08, MAT-09]
key-files:
  - hono-server/src/infra/db/clickhouse/schema.ts
  - hono-server/src/services/log/internal/repo/ILogReadRepo.ts
  - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts
  - hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts
decisions:
  - D-13/D-14/D-15: Use grouped latest-version selection (argMax) instead of ReplacingMergeTree FINAL for read-model loads.
  - D-02: Use explicit tuple bookmarks (time, id, type) for deterministic raw event resume.
  - R-03-scope: Removed 'scope' column from read_nodes as it was not supported by source artifacts.
metrics:
  duration: 25m
  completed_date: 2026-06-04
---

# Phase 03 Plan 01: Align ClickHouse read schema and repository load surfaces

Aligned the ClickHouse read schema and implemented materialization-facing repository load methods in `LogReadRepoClickHouse` to support incremental trace materialization.

## Key Changes

### 1. Schema Alignment
- Resolved the `read_nodes.scope` column mismatch by removing it from the ClickHouse DDL in `schema.ts`.
- Validated that materialization writes and reads do not depend on a `scope` field.

### 2. Repository Contract Expansion
- Extended `ILogReadRepo` with `loadRawEventsAfterCheckpoint`.
- This method allows loading only raw node/edge events that occur after a specific materialization checkpoint.

### 3. Implementation of Load Surfaces
- **loadCheckpoint**: Queries the `materialization_checkpoints` table for the latest bookmark for a given `userId` and `traceId`.
- **loadLatestReadModel**: Loads the current state of read nodes, edges, and summary using `argMax(..., materialized_at_ms)` and `max(materialized_at_ms)`. This ensures we always get the latest version without relying on ClickHouse background merges.
- **loadRawEventsAfterCheckpoint**: Uses ClickHouse `tuple` comparisons against `(event_time, id, event_type)` to provide a deterministic progress boundary for resuming materialization.

### 4. Testing
- Extended `LogReadRepoClickHouse.test.ts` with a fake-client implementation that supports `query` and `json()`.
- Added tests for every load surface, asserting correct SQL generation (scoping by `userId`/`traceId`, `argMax` usage, and tuple tie-breakers).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `read_nodes.scope` mismatch is resolved.
- [x] `ILogReadRepo` exposes checkpoint, latest-state, and raw-after-checkpoint surfaces.
- [x] ClickHouse load queries are scoped by `userId` and `traceId`.
- [x] Raw event resume uses lifecycle timestamp, id, and event type tie breakers.
- [x] All tests pass.

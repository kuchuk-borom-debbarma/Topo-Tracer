---
phase: 02-read-schema-and-repository-contracts
plan: 02
subsystem: hono-server
tags:
  - clickhouse
  - schema
  - read-model
dependency_graph:
  requires:
    - 02-01
  provides:
    - RSCH-03
    - RSCH-04
    - RSCH-05
    - RSCH-06
    - RSCH-07
    - RSCH-08
  affects:
    - hono-server/src/infra/db/clickhouse/schema.ts
    - hono-server/src/infra/db/clickhouse/clickhouse.ts
tech-stack:
  added:
    - ReplacingMergeTree
key-files:
  - hono-server/src/infra/db/clickhouse/schema.ts
  - hono-server/src/infra/db/clickhouse/schema.test.ts
decisions:
  - Used `ReplacingMergeTree` for all read-model tables to support latest-state versioning.
  - Checkpoints include deterministic tie-breakers (event id and type) for exact bookmarks.
  - Trace summaries use fixed diagnostic count columns instead of a Map for better query performance and schema clarity.
metrics:
  duration: 15min
  completed_date: "2026-06-04"
---

# Phase 02 Plan 02: Commented ClickHouse Read Model Schema Summary

## Substantive Summary
Added the heavily commented ClickHouse read-model development schema, providing stable DDL for read-optimized nodes, edges, trace summaries, and materialization checkpoints. Every new column includes a ClickHouse `COMMENT` explaining its purpose, and every DDL constant is accompanied by a TypeScript design comment. The schema uses the `ReplacingMergeTree` engine with `materialized_at_ms` or `updated_at_ms` versioning to handle latest-state updates without relying on in-place mutations.

## Key Changes
- **Read Nodes:** `read_nodes` table with importance, flow order, and lifecycle fields.
- **Read Edges:** `read_edges` table with denormalized endpoint flow orders to support efficient projection.
- **Trace Summaries:** `trace_summaries` table with counts, bounds, and seven named diagnostic categories.
- **Checkpoints:** `materialization_checkpoints` table with exact source progress bookmarks for nodes and edges, including deterministic tie-breakers.
- **Registration:** All new DDL constants are registered in `CLICKHOUSE_SCHEMA_STATEMENTS` for automatic development initialization.
- **Verification:** Added `schema.test.ts` to enforce that every column has a comment and that key columns are present. Updated `bun-test.d.ts` to include missing matchers needed for these assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing bun:test matchers**
- **Found during:** Task 2 (tsc check)
- **Issue:** `bun x tsc` failed because `bun:test` matchers like `toBeDefined`, `toContain`, and `toMatch` were missing from the project's custom `bun-test.d.ts`.
- **Fix:** Updated `hono-server/src/test-support/bun-test.d.ts` to include the missing matchers.
- **Files modified:** `hono-server/src/test-support/bun-test.d.ts`
- **Commit:** ea75fd0

### Known Deviations
- **Live ClickHouse Smoke Skip:** ClickHouse was not available at `http://localhost:8123` during execution, so the optional live smoke test was skipped as per the plan's conditional instruction.
- **Fallow failure:** `bun run fallow` failed with exit code 1 due to "Unused files" (`schema.test.ts`) and "Unused exports" (new DDL constants). This is expected at this stage as the new infrastructure is not yet integrated into the main entry points.

## Self-Check: PASSED
- [x] Four read-model DDL constants exist and are registered.
- [x] Every new read table column has a ClickHouse `COMMENT`.
- [x] Every new read DDL constant has a TypeScript design comment.
- [x] DDL supports latest node, latest edge, summary, and checkpoint requirements.
- [x] All tests in `hono-server` pass.
- [x] `tsc` check passes.

---
phase: 02-read-schema-and-repository-contracts
researched: 2026-06-05
status: complete
requirements:
  - RSCH-03
  - RSCH-04
  - RSCH-05
  - RSCH-06
  - RSCH-07
  - RSCH-08
  - RSCH-09
sources:
  - .planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md
  - .planning/phases/01-edge-endpoint-raw-contract/01-VERIFICATION.md
  - hono-server/src/code-base.md
  - hono-server/src/infra/db/clickhouse/schema.ts
  - hono-server/src/services/log/internal/repo/ILogReadRepo.ts
  - hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts
  - https://clickhouse.com/docs/sql-reference/statements/create/table
  - https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree
---

# Phase 2 Research: Read Schema And Repository Contracts

## Research Complete

Phase 2 should create the read-model foundation inside `hono-server` without
building the materializer, projection reads, HTTP routes, frontend behavior, or
legacy `carno.js` behavior. The best plan shape is three narrow waves:

1. Define plain read-model and checkpoint types plus `ILogReadRepo`.
2. Add heavily commented ClickHouse read table DDL.
3. Add a ClickHouse read repository skeleton with row mapping tests and no
   materialization behavior.

This keeps the phase focused on RSCH-03 through RSCH-09 while giving Phase 3 a
real contract to implement against.

## Current Code Findings

### Hono Structure

- `hono-server/src/code-base.md` requires public service types in `api`, private
  row/repo types under `internal`, and database access only inside repository
  implementations.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` already exists,
  but is empty. This is the correct contract surface to expand for Phase 2.
- `hono-server/src/services/log/internal/repo/index.ts` currently wires a
  placeholder `DevLogReadRepo`. Phase 2 can replace this with a factory that
  returns a ClickHouse implementation, mirroring `createLogWriteRepo`.
- `LogWriteRepoClickHouse` already uses constructor-injected ClickHouse client
  providers for tests while defaulting to `getInitializedClickHouseClient()` in
  production. Reuse this pattern for read repo tests.
- `ReadOptimisedAggregator.rebuildTrace` is still a stub. Phase 2 should not
  implement it, but its later materialization path needs checkpoint and write
  methods from `ILogReadRepo`.

### Raw Contract From Phase 1

- Raw node and edge events now use split lifecycle fields:
  `started_at_ms` and `ended_at_ms`.
- Raw edge start rows carry explicit `from_node_id`, `to_node_id`, and `data`.
- Latest read rows should be derived from raw lifecycle rows later, not during
  Phase 2.

## ClickHouse Findings

### Comments Are Native Schema

Official ClickHouse `CREATE TABLE` syntax supports `COMMENT 'comment for
column'` on columns and `COMMENT 'comment for table'` after the engine clause.
That matches the user's requirement that every new read-table column explain its
purpose directly in the schema.

### Replacement Rows Need Query-Time Correctness

ClickHouse `ReplacingMergeTree([ver])` removes duplicate rows with the same
`ORDER BY` sorting key during background merges, not immediately. The docs state
that this does not guarantee the absence of duplicates at query time. With a
version column, the largest version wins during merges. Therefore Phase 2 should
define versioned replacement rows, but later read contracts and tests should not
depend on background merge timing. Query-time latest-state logic should use
grouped selection such as `argMax(..., materialized_at_ms)` or an explicit
equivalent rather than relying on `FINAL` as the normal path.

### Recommended Engine Direction

Use `ReplacingMergeTree(materialized_at_ms)` for latest read-state tables and
summary rows if rows are versioned by logical key:

- read nodes keyed by `(user_id, trace_id, id)`;
- read edges keyed by `(user_id, trace_id, id)`;
- trace summaries keyed by `(user_id, trace_id)`;
- checkpoints keyed by `(user_id, trace_id)` or `(user_id, trace_id, source)`,
  depending on whether node/edge progress is stored together or separately.

The plan should require `ORDER BY` tuples that match these logical keys and
common query scopes. Avoid nullable columns in the sorting key unless absolutely
needed.

## Read Table Contract Recommendations

### Read Nodes

Read node rows should represent latest node state needed by materialization and
future projection:

- ownership/scope: `user_id`, `trace_id`;
- logical key: node `id`;
- lifecycle: `started_at_ms`, `ended_at_ms`;
- metadata: `node_type`, `data`, `start_message`, `end_message`;
- projection support: `importance_level`, `flow_order`;
- version: `materialized_at_ms`.

Every column should have a ClickHouse `COMMENT`. The DDL constant should have a
TypeScript comment explaining that the table stores versioned latest node state
written by materialization and queried later through latest-version selection.

### Read Edges

Read edge rows should represent latest edge state with enough denormalization
for later bounded projection:

- ownership/scope: `user_id`, `trace_id`;
- logical key: edge `id`;
- lifecycle: `started_at_ms`, `ended_at_ms`;
- metadata: `edge_type`, `data`;
- graph endpoints: `from_node_id`, `to_node_id`;
- projection support: `from_flow_order`, `to_flow_order`;
- version: `materialized_at_ms`.

The endpoint ids come from Phase 1 raw edge start rows. The flow-order columns
are denormalized so Phase 4 can avoid joining every edge back to every node for
bounded projection reads.

### Trace Summaries

Trace summary rows should be versioned rows keyed by user/trace and expose:

- `node_count`, `edge_count`;
- `min_importance_level`, `max_importance_level`;
- `started_at_ms`, `ended_at_ms`;
- `materialized_at_ms`;
- fixed diagnostic count columns.

Named diagnostic columns should include at least the malformed-data categories
already referenced by the project: missing starts, missing ends, negative
durations, cycles, orphan edges, invalid importance, and clock skew. The planner
may tune exact names, but should keep them fixed fields rather than a map.

### Materialization Checkpoints

Checkpoint rows should be explicit source-progress bookmarks, separate from
latest read state. Because the user chose exact bookmarks, the checkpoint must
store enough tie-breaker information to resume deterministically when raw events
share timestamps.

Recommended contract:

- `user_id`, `trace_id`;
- raw node progress fields: last processed lifecycle time plus deterministic
  tie breakers such as event id and event type;
- raw edge progress fields: last processed lifecycle time plus deterministic
  tie breakers such as event id and event type;
- `materialized_at_ms` or `checkpointed_at_ms` to version checkpoint rows.

The planner may choose one combined checkpoint row per trace or separate rows
per raw source stream, but the exact bookmark behavior must be testable.

## Repository Contract Recommendations

`ILogReadRepo` should define only Phase 3 materialization needs:

- load current checkpoint for `userId` and `traceId`;
- load current latest read state for a trace if Phase 3 merge logic needs it;
- write replacement read node rows;
- write replacement read edge rows;
- write trace summary row;
- write checkpoint row after successful related writes.

Do not add projection-facing fetch methods in Phase 2. Methods like "fetch
visible nodes by threshold" or "fetch projected edges with caps" belong in
Phase 4.

The concrete ClickHouse repo can initially focus on writes and contracts. If the
planner includes read methods, tests should capture generated query calls or
fake client invocations without requiring live ClickHouse.

## Documentation Requirements

The user explicitly requested schema comments. Plans must enforce:

- every new read-table column has a ClickHouse `COMMENT`;
- every read-table DDL constant has a nearby TypeScript comment explaining the
  table's purpose and read-model design;
- comments explain versioned latest rows, exact checkpoints, summary rows, and
  denormalized edge flow order;
- tests or source assertions verify comments exist for every expected column.

This should appear in every relevant plan's `acceptance_criteria`, not just in
the implementation prose.

## Suggested Plan Split

### Plan 02-01: Read Types And Repository Contract

Purpose: Define plain TypeScript types and `ILogReadRepo` methods for Phase 3
materialization.

Likely files:

- `hono-server/src/services/log/api/types.ts`
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts`
- `hono-server/src/services/log/internal/repo/types.ts`
- tests near `internal/repo`

### Plan 02-02: Commented ClickHouse Read DDL

Purpose: Add read node, read edge, trace summary, and checkpoint table constants
with every column commented and included in `CLICKHOUSE_SCHEMA_STATEMENTS`.

Likely files:

- `hono-server/src/infra/db/clickhouse/schema.ts`
- schema-focused tests

### Plan 02-03: ClickHouse Read Repo Skeleton And Wiring

Purpose: Add a concrete repository implementation or skeleton that maps typed
read-model rows to `JSONEachRow` inserts and wires `createLogReadRepo`.

Likely files:

- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- `hono-server/src/services/log/internal/repo/index.ts`

## Validation Architecture

### Automated Checks

- `cd hono-server && bun test`
- `cd hono-server && bun x tsc --noEmit --project tsconfig.json`
- `cd hono-server && bun run fallow`

### Structural Assertions

- `schema.ts` contains four read table constants.
- Every read table constant has a TypeScript comment immediately above it.
- Every new read table column has a `COMMENT`.
- `CLICKHOUSE_SCHEMA_STATEMENTS` includes all read DDL constants.
- `ILogReadRepo` exposes materialization-facing methods but no projection-facing
  threshold/window methods.
- `hono-server/src` is the only source tree touched.

### Behavioral Test Targets

- Fake ClickHouse client captures `JSONEachRow` inserts for read nodes, edges,
  summaries, and checkpoints.
- Repository tests assert `materialized_at_ms` is included on versioned read
  rows.
- Checkpoint tests assert exact bookmark fields are present for both node and
  edge progress.
- Schema tests assert comments exist and no read table has uncommented columns.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Schema comments get dropped as "cosmetic" | Make comments explicit acceptance criteria and test them structurally. |
| Phase 2 accidentally implements materialization | Keep `ReadOptimisedAggregator.rebuildTrace` behavior stubbed and scope plans to contracts/schema/wiring only. |
| Repository contract drifts into projection methods | Defer threshold/window reads to Phase 4 and verify method names do not expose projection behavior. |
| ReplacingMergeTree is treated as immediately deduplicated | Plans must mention query-time latest selection and avoid relying on background merges for correctness. |
| Checkpoints are too vague | Require node and edge source progress fields with deterministic tie breakers. |

## External Sources Consulted

- [ClickHouse CREATE TABLE docs](https://clickhouse.com/docs/sql-reference/statements/create/table) — confirms column and table `COMMENT` syntax.
- [ClickHouse ReplacingMergeTree docs](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree) — confirms versioned replacement behavior, `ORDER BY` uniqueness, background merge timing, and query-time deduplication caveat.

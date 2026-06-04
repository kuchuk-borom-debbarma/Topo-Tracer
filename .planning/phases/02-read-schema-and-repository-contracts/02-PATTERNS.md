---
phase: 02-read-schema-and-repository-contracts
created: 2026-06-05
status: complete
---

# Phase 2 Pattern Map

## Files To Create Or Modify

| Target | Role | Closest Existing Analog | Pattern To Reuse |
|--------|------|-------------------------|------------------|
| `hono-server/src/services/log/api/types.ts` | Public read-model types | Existing `IngestNodeStart`, `IngestEdgeStart` | Plain explicit exported TypeScript types; no composed public utility types. |
| `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` | Read repository contract | `ILogWriteRepo.ts` | Abstract class with object-shaped method inputs and explicit Promise returns. |
| `hono-server/src/services/log/internal/repo/types.ts` | Repo-private read row types | Existing `NodeEventRow`, `EdgeEventRow` | Snake-case ClickHouse row types kept internal to repo layer. |
| `hono-server/src/infra/db/clickhouse/schema.ts` | ClickHouse DDL constants | Current raw `node_events` and `edge_events` DDL | Export table-name constants, `CREATE TABLE` strings, and append to `CLICKHOUSE_SCHEMA_STATEMENTS`. |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | Read repository implementation | `LogWriteRepoClickHouse.ts` | Constructor-injected ClickHouse client provider, safe count logging, `JSONEachRow` inserts. |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | Repository mapping tests | `LogWriteRepoClickHouse.test.ts` | Fake ClickHouse client captures `insert({ table, values, format: "JSONEachRow" })`. |
| `hono-server/src/services/log/internal/repo/index.ts` | Repository wiring | Existing `createLogWriteRepo` | Export `createLogReadRepo(parentLogger)` and preserve contract return type. |

## Reusable Code Excerpts

### Repository Factory Pattern

From `hono-server/src/services/log/internal/repo/index.ts`:

```ts
export const createLogWriteRepo = (
  parentLogger: Logger<unknown>,
): ILogWriteRepo => {
  return new LogWriteRepoClickHouse(parentLogger);
};
```

Use the same shape for `createLogReadRepo`, returning `ILogReadRepo`.

### Test Client Injection Pattern

From `LogWriteRepoClickHouse.test.ts`:

```ts
type InsertOptions = {
  table: string;
  values: unknown[];
  format: "JSONEachRow";
};

class FakeClickHouseClient {
  inserts: InsertOptions[] = [];

  async insert(options: InsertOptions): Promise<void> {
    this.inserts.push(options);
  }
}
```

Reuse this for read repo mapping tests. The tests should assert table names,
`JSONEachRow`, `materialized_at_ms`, checkpoint bookmark fields, and fixed
diagnostic columns.

### Schema Constant Pattern

From `schema.ts`:

```ts
export const CLICKHOUSE_NODE_EVENTS_TABLE = "node_events";

export const CLICKHOUSE_CREATE_NODE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_NODE_EVENTS_TABLE}
(
  id String COMMENT 'Node id from the traced system'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, event_type);
`;
```

Phase 2 should extend this file with table-name constants and `CREATE TABLE`
constants for read nodes, read edges, trace summaries, and checkpoints. Every
new column must include a ClickHouse `COMMENT`.

## Design Constraints From Existing Patterns

- Keep public read-model shapes in `api/types.ts` only when they are part of the
  service/module contract. Keep ClickHouse row details in `internal/repo/types.ts`.
- Do not import ClickHouse infrastructure from services or workers.
- Do not add route files or mount routes in `src/index.ts` for Phase 2.
- Do not implement `ReadOptimisedAggregator.rebuildTrace`; Phase 2 only gives
  that future code repository contracts to call.
- Do not create projection read methods such as `getVisibleNodes` or
  `getProjectedEdges`; those belong to Phase 4.

## Verification Patterns

- Use `bun:test` for new tests.
- Use fake clients and source assertions instead of requiring live ClickHouse.
- Run `cd hono-server && bun test`.
- Run `cd hono-server && bun x tsc --noEmit --project tsconfig.json`.
- Run `cd hono-server && bun run fallow` after source changes.

## Landmines

- `ReplacingMergeTree` deduplication is eventual. Do not write plans that assume
  background merges make latest rows unique at query time.
- The user explicitly requires comments for every read table column. Plans must
  include source assertions for `COMMENT` coverage.
- Checkpoints must be exact bookmarks. A single `last_processed_at_ms` field is
  not enough unless paired with deterministic tie breakers.
- Projection-specific repo methods are tempting here but out of scope.

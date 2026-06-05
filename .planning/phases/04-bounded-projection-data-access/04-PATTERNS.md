# Phase 04: Bounded Projection Data Access - Pattern Map

## Purpose

Map concrete code patterns for Phase 4 bounded projection repository work.

## Files To Modify

| File | Role | Closest Analog | Pattern To Reuse |
|------|------|----------------|------------------|
| `hono-server/src/services/log/api/types.ts` | Projection-facing plain DTOs and cap metadata types | Existing `ReadNode`, `ReadEdge`, `ReadTraceSummary` | Plain explicit exported types with camelCase fields, no database row shapes |
| `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` | Repository contract extension | Existing `loadCheckpoint`, `loadLatestReadModel`, `loadRawEventsAfterCheckpoint` methods | Abstract methods with object parameters requiring `userId` and `traceId` |
| `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` | Contract/source assertions | Existing string assertions for read-model contract | Source assertions without importing not-yet-implemented runtime behavior |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | ClickHouse bounded query implementation | Existing latest read model and raw checkpoint load methods | `client.query`, `JSONEachRow`, `query_params`, `argMax`, mapped rows |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | Fake-client query assertions | Existing fake client captures queries and returns keyed results | Assert query text, `query_params`, mapped rows, cap slicing |

## Existing Query Pattern

`LogReadRepoClickHouse.loadLatestReadModel` currently uses:

- one `client.query` per logical read surface;
- `format: "JSONEachRow"`;
- `query_params` for `userId` and `traceId`;
- grouped `argMax(..., materialized_at_ms)` latest-state selection;
- row mapping from snake_case ClickHouse rows to camelCase public types.

Phase 4 should keep this style but add bounded projection-specific methods
instead of reusing the full `loadLatestReadModel` path.

## Fake Client Pattern

`LogReadRepoClickHouse.test.ts` already provides:

- `FakeClickHouseClient.queries` for source/query assertions;
- `FakeClickHouseClient.queryResults` for controlled row results;
- `createRepo(fakeClient)` for constructing the repo with injected client;
- tests that inspect query text with `.toContain(...)` and query params with
  `.toMatchObject(...)`.

Phase 4 should extend this fake client rather than introduce a new test harness.

## Implementation Constraints

- `LogReadRepoClickHouse` may import ClickHouse table constants.
- Services and workers must not import ClickHouse clients.
- Projection methods must require `userId` and `traceId`.
- Projection methods must use `LIMIT cap + 1` and slice returned rows to `cap`.
- Projection methods must return `capHit` metadata.
- Production bounded projection methods must not call `loadLatestReadModel`.
- Tests may use tiny fixture rows, but production projection path must be
  bounded at query level.

## Verification Commands

- `cd hono-server && bun test src/services/log/internal/repo/ILogReadRepo.test.ts`
- `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- `cd hono-server && bun test`
- `cd hono-server && bun run fallow`


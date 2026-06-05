# Phase 5: Ghost Projection Logic - Patterns

## Purpose

Map Phase 5 files to existing code patterns so execution can reuse local
structure instead of inventing new architecture.

## Files To Create

| File | Role | Closest Existing Analog | Pattern To Follow |
|------|------|-------------------------|-------------------|
| `hono-server/src/services/log/internal/projection/LogGraphProjector.ts` | Pure in-memory projection component | `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` | Keep business algorithm internal, explicit params, plain TypeScript, no ClickHouse imports. |
| `hono-server/src/services/log/internal/projection/LogGraphProjector.test.ts` | Fixture tests for projection behavior | `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` and `flowOrder.test.ts` | Use `bun:test`, plain fixtures, assert exact arrays/counts. |
| `hono-server/src/services/log/internal/projection/types.ts` | Internal helper types if needed | `hono-server/src/services/log/internal/materialization/types.ts` | Keep intermediate maps/private shapes internal. |
| `.planning/phases/05-ghost-projection-logic/05-TECHNICAL.md` | Phase technical documentation | `.planning/phases/04-bounded-projection-data-access/04-TECHNICAL.md` | Explain contract, algorithm, cap behavior, and deferred route/windowing work. |

## Files To Modify

| File | Role | Closest Existing Analog | Pattern To Follow |
|------|------|-------------------------|-------------------|
| `hono-server/src/services/log/api/types.ts` | Public projection DTOs | Existing `ReadNode`, `ReadEdge`, `ProjectionReadCap` | Add explicit exported types; do not expose row types. |
| `hono-server/src/services/log/api/ILogService.ts` | Service contract | Existing `ingestNodesNEdges` object-param method | Add object-param projection method with explicit return type. |
| `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` | Orchestrates repo and projector | Existing ingest orchestration in same file | Keep route/database concerns out; log safe summary metadata only. |
| `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` | Service orchestration tests | Existing service tests | Use fake repos/event bus and source assertions. |
| `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` | Read repository contract | Existing bounded projection methods | Add bounded projection-node input method; keep cap constants internal. |
| `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` | Contract assertions | Existing string-based source assertions | Assert new method/types exist and ancestry/full-projection names do not. |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | ClickHouse bounded input implementation | `loadBoundedVisibleNodes` | Reuse grouped `argMax`, scope filters, deterministic ordering, `LIMIT cap + 1`. |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | Fake-client repository tests | Existing bounded node/edge tests | Assert query text, query params, cap slicing, no full latest-state call. |

## Established Local Rules

- Hono business logic belongs in service/internal components, not routes.
- Repositories own ClickHouse queries and should not contain ghost/snapping
  business rules beyond bounded input reads.
- Public service output types belong in `services/log/api/types.ts`.
- Repository row shapes remain internal to `services/log/internal/repo/types.ts`.
- Tests use `bun:test`, fake clients, and source assertions for architectural
  boundaries.
- Verification commands for Hono are `cd hono-server && bun test` and
  `cd hono-server && bun run fallow`.

## Key Implementation Cautions

- `loadBoundedVisibleNodes` is threshold-filtered and cannot produce all-hidden
  ghosts alone.
- Do not use or add ancestry path fields.
- Do not call `loadLatestReadModel` from production projection orchestration.
- Do not add Hono routes in Phase 5.
- Preserve explicit-edge semantics: never infer graph links from node ids,
  start order, or flow order alone.

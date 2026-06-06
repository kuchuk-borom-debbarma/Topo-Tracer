# Milestone Audit: v1.0 Hono-only Read Model Pipeline

**Audit Date:** 2026-06-05
**Status:** PASSED
**Milestone:** v1.0
**Definition of Done:** Hono-only read model pipeline for large trace inspection is functional, verified, and safe.

## Audit Summary

The milestone v1.0 has successfully delivered the core read-optimized telemetry pipeline within `hono-server`. All six phases of implementation and verification are complete, achieving 100% coverage of the 35 defined v1 requirements. The system supports idempotent incremental materialization, deterministic graph flow ordering, and performance-safe ghost projection.

## Goal Achievement

| Goal | Status | Evidence |
|------|--------|----------|
| **Edge Endpoints** | ACHIEVED | `fromNodeId` and `toNodeId` persisted in raw events (Phase 1). |
| **Read Schema** | ACHIEVED | Latest-state read tables and checkpoints registered in ClickHouse (Phase 2). |
| **Materialization** | ACHIEVED | Checkpointed materializer handles event folding and idempotency (Phase 3). |
| **Bounded Reads** | ACHIEVED | Repository enforces hard caps and trace-scoped queries (Phase 4). |
| **Ghost Projection** | ACHIEVED | `LogGraphProjector` implements visibility, ghosting, and snapping (Phase 5). |
| **Observability** | ACHIEVED | Safe scalar logging and fixture-heavy test coverage (Phase 6). |

## Integration & E2E Flows

The integration audit confirmed that all cross-phase boundaries are correctly wired:
- **Ingestion → Materialization:** `LogServiceImpl` triggers `EventBus` → `ReadOptimisedAggregator` → `TraceReadModelMaterializer` → `LogReadRepoClickHouse`.
- **Read → Projection:** `LogServiceImpl` orchestrates `LogReadRepoClickHouse` → `LogGraphProjector`.
- **Type Safety:** Consistent usage of `api/types.ts` and `repo/types.ts` across all modules.

## Quality Gate Verification

| check | status | notes |
|-------|--------|-------|
| **Tests** | PASSED | 81 tests green in `hono-server`. |
| **Linting** | PASSED | `tsc --noEmit` and `fallow run` are clean. |
| **Security** | PASSED | Source assertions forbid raw payload logging and ancestry leakage. |
| **UAT** | PASSED | All 18 UAT items across phases 2-5 are marked passed. |

## Technical Debt & Deferred Gaps

- **[Medium] Backend Divergence:** `carno.js` remains the legacy backend; `hono-server` is the new primary.
- **[Medium] Route Exposure:** Services are integrated but routes are not yet mounted in `src/index.ts` (Phase 6 deferred).
- **[Low] Fallow Warnings:** Some files are marked unused until v2 route integration.
- **[Low] PK Optimization:** Raw table sort key is not yet optimized for large trace-local lifecycle sorting.

## Requirements Coverage

| Category | Requirements | Satisfied | % |
|----------|--------------|-----------|---|
| Read Schema | 9 | 9 | 100% |
| Materialization | 9 | 9 | 100% |
| Ghost Projection | 9 | 9 | 100% |
| Safety & Verification | 8 | 8 | 100% |
| **Total** | **35** | **35** | **100%** |

## Conclusion

Milestone v1.0 is **Behavioral Complete**. The core logic for large-trace inspection is implemented and verified. The project is ready to transition to **v2: Read APIs and Windowing**, which will focus on exposing these capabilities through HTTP routes and implementing frontend-facing drill-down behavior.

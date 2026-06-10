# Roadmap: Trace Flow Endpoint

## Phase 1: Research & Interface Alignment
**Goal:** Research & Interface Alignment. Ensure `ILogService.projectTraceGraph` matches its implementation and verify types are ready for the `/flow` endpoint.
**Plans:** 1 plans
- [x] 01-01-PLAN.md — Align ILogService interface and verify types.

**Requirements:**
- [x] Verify `ILogService` interface matches implementation requirements.
- [x] Confirm `LogGraphProjector` and `ILogReadRepo` support necessary pagination parameters.
- [x] Audit `LogReadRepoClickHouse` for pagination implementation details.

## Phase 2: Implementation - Service Layer
**Goal:** Implementation - Service Layer. Confirm `LogServiceImpl` and `CursorCodec` are ready for the `/flow` endpoint via verification.
**Plans:** 1/1 plans executed
- [x] 02-01-PLAN.md — Verify service layer logic and coverage.

**Requirements:**
- [x] REFINE-SERVICE: Refine LogServiceImpl.projectTraceGraph or implement a new getTraceFlow method.
- [x] ENSURE-CURSOR: Ensure CursorCodec handles all necessary pagination state.
- [x] VERIFY-ERROR: Verify service-level error handling (ConflictError for stale cursors).

## Phase 3: Implementation - Route & Wiring
**Goal:** Implementation - Route & Wiring. Expose the `/flow` endpoint, decommission `/graph`, and perform global rename.
**Plans:** 3/3 plans executed
- [x] 03-01-PLAN.md — Perform global rename of "graph" to "flow".
- [x] 03-02-PLAN.md — Register /flow route and decommission /graph.
- [x] 03-03-PLAN.md — Implement integration tests for /flow.

**Requirements:**
- [x] RENAME-GLOBAL: Perform global rename of "graph" to "flow" (files, symbols, types).
- [x] DECOMMISSION-GRAPH: Remove `GET /api/v1/traces/:traceId/graph`.
- [x] REGISTER-FLOW: Register `GET /api/v1/traces/:traceId/flow` in `src/index.ts`.
- [x] VALIDATE-PARAMS: Implement robust validation for `threshold` and `limit`.
- [x] TEST-INTEGRATION: Implement integration tests in `src/index.flow.test.ts`.

## Phase 4: Quality & Integrity
**Goal:** Quality & Integrity. Ensure architectural compliance and final cleanup.
**Plans:** 1/1 plans executed
- [x] 04-01-PLAN.md — Comprehensive documentation audit and architectural integrity check.

**Requirements:**
- [x] AUDIT-ARCHITECTURE: Run `bun run fallow` to ensure integrity.
- [x] CLEANUP-DOCS: Update any remaining documentation to reflect the rename.

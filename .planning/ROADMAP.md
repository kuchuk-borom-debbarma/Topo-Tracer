# Roadmap: Topo Tracer Hono Read Models

## Overview

This roadmap delivers the Hono-only read model pipeline for large trace inspection. It starts by making raw edge events carry explicit graph endpoints, then adds read-optimized ClickHouse schema and repository contracts, checkpointed incremental materialization, bounded projection data access, read-time ghost projection, and verification hardening. v1 does not add HTTP endpoints or touch `carno.js`; all implementation work stays inside `hono-server` and follows `hono-server/src/code-base.md`.

## Implementation Rules

Every phase must read and follow `hono-server/src/code-base.md` before planning
or implementing Hono changes. That guide defines the required service/repository
boundaries, ClickHouse access rules, event bus semantics, logger usage, type
organization, and verification expectations for this project.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Edge Endpoint Raw Contract** - Hono edge ingestion and raw edge storage carry explicit `fromNodeId` and `toNodeId` endpoint data. (completed 2026-06-04)
- [ ] **Phase 2: Read Schema And Repository Contracts** - ClickHouse read tables, plain read-model types, and repository contracts exist for latest state, summaries, and checkpoints.
- [ ] **Phase 3: Checkpointed Materialization** - Read-model materialization incrementally folds raw events through checkpoints and writes latest read rows through repositories.
- [ ] **Phase 4: Bounded Projection Data Access** - Projection repository methods are trace-scoped and enforce hard node, edge, and scan caps before projection logic depends on them.
- [ ] **Phase 5: Ghost Projection Logic** - Importance-threshold projection returns visible nodes, deterministic ghost nodes, snapped edges, aggregate edges, and response metadata.
- [ ] **Phase 6: Verification And Safe Observability** - Tests and logs lock down idempotency, late-event ordering, ghost edge cases, safety caps, and safe runtime summaries.

## Phase Details

### Phase 1: Edge Endpoint Raw Contract

**Goal**: Edge events entering and stored by Hono contain explicit graph endpoint IDs required by every later read projection.
**Depends on**: Nothing (first phase)
**Requirements**: RSCH-01, RSCH-02
**Success Criteria** (what must be TRUE):

  1. Edge start ingestion accepts `fromNodeId` and `toNodeId` as required graph endpoint fields.
  2. Raw ClickHouse edge event rows persist endpoint values as `from_node_id` and `to_node_id`.
  3. Existing append-only edge ingestion continues to publish read-model work only after persistence succeeds.

**Plans**: 2 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Add public edge-start endpoint contract and service validation for RSCH-01.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Persist explicit endpoint and lifecycle columns in raw ClickHouse edge rows for RSCH-02.

### Phase 2: Read Schema And Repository Contracts

**Goal**: The read side has stable ClickHouse tables, plain TypeScript contracts, and repository boundaries for latest nodes, latest edges, summaries, and checkpoints.
**Depends on**: Phase 1
**Requirements**: RSCH-03, RSCH-04, RSCH-05, RSCH-06, RSCH-07, RSCH-08, RSCH-09
**Success Criteria** (what must be TRUE):

  1. Read node rows represent latest node state by `user_id`, `trace_id`, node id, `importance_level`, and `flow_order`.
  2. Read edge rows represent latest edge state by `user_id`, `trace_id`, edge id, endpoint ids, and denormalized endpoint flow order.
  3. Trace summary rows expose counts, importance bounds, time bounds, materialization time, and diagnostics.
  4. Materialization checkpoint rows store per-trace raw source progress separately from latest read state.
  5. Public and internal read-model types are plain explicit types in the `api` or `internal` files required by `hono-server/src/code-base.md`.

**Plans**: TBD

### Phase 3: Checkpointed Materialization

**Goal**: The read-model worker incrementally materializes latest state and summaries from raw events using explicit checkpoints and repository contracts.
**Depends on**: Phase 2
**Requirements**: MAT-01, MAT-02, MAT-03, MAT-04, MAT-05, MAT-06, MAT-07, MAT-08, MAT-09
**Success Criteria** (what must be TRUE):

  1. `ReadOptimisedAggregator` delegates trace rebuild work to a materialization component.
  2. Materialization loads the current checkpoint, reads only later raw events in deterministic order, and merges them into existing latest read state.
  3. Read node, read edge, and trace summary replacement rows are written through `ILogReadRepo` without direct ClickHouse access in services or workers.
  4. Checkpoints advance only after related read rows and summaries are written successfully.
  5. Duplicate delivery, malformed graph data, and invalid ordering inputs produce idempotent state plus diagnostic counts instead of duplicate latest rows or checkpoint regression.

**Plans**: TBD

### Phase 4: Bounded Projection Data Access

**Goal**: Projection reads are scoped and bounded at repository level before graph projection logic can request unsafe trace-wide data.
**Depends on**: Phase 3
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04
**Success Criteria** (what must be TRUE):

  1. Projection repository methods require `user_id` and `trace_id` scope for every node and edge read.
  2. Visible node reads stop at a configured maximum for one projection operation.
  3. Projected edge reads stop at a configured maximum for one projection operation.
  4. Repository code cannot fetch all nodes or all edges for a trace unless a test fixture explicitly proves the trace is within configured safe limits.

**Plans**: TBD

### Phase 5: Ghost Projection Logic

**Goal**: Internal graph projection can turn materialized latest state into a bounded importance-threshold graph with deterministic ghosts and snapped aggregate edges.
**Depends on**: Phase 4
**Requirements**: GPRJ-01, GPRJ-02, GPRJ-03, GPRJ-04, GPRJ-05, GPRJ-06, GPRJ-07, GPRJ-08, GPRJ-09
**Success Criteria** (what must be TRUE):

  1. Projection treats normal nodes as visible only when `importanceLevel <= selectedThreshold` and never returns higher-importance hidden nodes as normal nodes.
  2. Hidden flow-order ranges produce deterministic ghost nodes with hidden counts, edge counts, node type counts, importance range, time range, and flow-order range.
  3. Visible-to-visible edges remain direct projected edges when both endpoints are visible.
  4. Edges that touch hidden ranges are snapped through ghost nodes, while hidden-to-hidden edges inside one ghost range become summary counts.
  5. Projected edges are aggregated by snapped source, snapped target, and edge type, and response metadata reports counts, threshold, materialization time, and safety-cap status.

**Plans**: TBD

### Phase 6: Verification And Safe Observability

**Goal**: Materialization and projection behavior is covered by focused fixtures, and runtime logs expose safe summaries without raw payload leakage.
**Depends on**: Phase 5
**Requirements**: SAFE-05, SAFE-06, SAFE-07, SAFE-08
**Success Criteria** (what must be TRUE):

  1. Tests prove duplicate `log.trace.ingested` delivery leaves materialized latest state and checkpoints idempotent.
  2. Tests prove late or out-of-order events follow the documented deterministic ordering behavior.
  3. Tests cover visible-hidden-visible chains, hidden prefixes, hidden suffixes, all-hidden traces, dense hidden edges, and orphan edges.
  4. Materialization and projection logs include safe IDs, counts, thresholds, caps, and durations without raw node or edge payloads.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Edge Endpoint Raw Contract | 2/2 | Complete   | 2026-06-04 |
| 2. Read Schema And Repository Contracts | 0/TBD | Not started | - |
| 3. Checkpointed Materialization | 0/TBD | Not started | - |
| 4. Bounded Projection Data Access | 0/TBD | Not started | - |
| 5. Ghost Projection Logic | 0/TBD | Not started | - |
| 6. Verification And Safe Observability | 0/TBD | Not started | - |

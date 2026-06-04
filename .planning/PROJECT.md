# Topo Tracer Hono Read Models

## What This Is

This project builds the read-optimized trace graph pipeline inside
`hono-server`. The source of truth is append-only node and edge event ingestion;
the read side materializes trace summaries, latest node state, latest edge
state, and importance-threshold graph projections that the UI can render without
replaying raw events.

This project intentionally ignores the older `carno.js` backend. New backend
behavior for this effort belongs in `hono-server/src`.

## Core Value

Users can inspect very large traces by importance level without the backend or
UI loading the entire trace graph.

## Requirements

### Validated

- ✓ Hono server has a contract-driven service/repository structure under
  `hono-server/src/services` — existing.
- ✓ Hono server has ClickHouse client setup and schema initialization under
  `hono-server/src/infra/db/clickhouse` — existing.
- ✓ Hono log ingestion writes append-only node and edge event rows through a
  repository contract — existing.
- ✓ Log ingestion publishes `log.trace.ingested` events through the event bus
  contract after persistence succeeds — existing.
- ✓ `ReadOptimisedAggregator` subscribes to `log.trace.ingested` and coalesces
  repeated trace events within a listener batch — existing scaffold.

### Active

- [ ] Add edge endpoint fields to Hono edge ingestion and raw edge event storage
  so read edges can connect `fromNodeId` to `toNodeId`.
- [ ] Define read-optimized ClickHouse tables for trace summaries, latest nodes,
  latest edges, and per-trace materialization checkpoints.
- [ ] Materialize read rows incrementally from append-only event tables using a
  per-trace checkpoint, not by inferring progress from latest read rows.
- [ ] Add `flow_order` to read nodes and denormalized endpoint metadata to read
  edges so graph reads can use bounded flow-order queries.
- [ ] Implement importance-threshold projection where nodes with
  `importanceLevel <= threshold` are visible and nodes above the threshold are
  collapsed.
- [ ] Generate ghost nodes at read time from hidden flow-order ranges, including
  hidden node counts, hidden edge counts, node type counts, importance range,
  and time range summaries.
- [ ] Project edges so visible nodes connect through ghost nodes when hidden
  nodes sit between visible graph milestones.
- [ ] Enforce hard read safety caps so graph projection never returns or scans
  unbounded nodes/edges for a single request.

### Out of Scope

- Full pagination/windowing UX — important, but deferred to the next milestone.
- Exact graph-component ghosting — deferred because arbitrary graph traversal is
  too expensive for the first ClickHouse read path.
- Materializing projected tables for every importance threshold — rejected
  because traces may have hundreds of importance levels.
- Storing complete ancestor arrays on every read node — rejected because the
  graph is not a bounded tree and ancestor lists can grow explosively.
- Implementing or changing the older `carno.js` backend — this project targets
  `hono-server` only.
- Durable production event bus implementation — needed later, but this project
  focuses on read model schema and aggregation behavior.

## Context

The current Hono log write path stores append-only node and edge events in
ClickHouse. Node events include `importanceLevel`; edge events currently lack
source and target node ids, which blocks real graph projection. The event bus
contract is batch-native, and the read-optimized aggregator exists as a listener
scaffold.

The read model must support very large single traces. The first user-facing
query is not general pagination; it is importance-threshold projection. Lower
importance numbers are more important. If the UI selects threshold `2`, nodes
with importance `1` and `2` are visible, while nodes with importance greater
than `2` are collapsed.

Ghost nodes should summarize hidden detail rather than silently dropping it.
The projection should preserve graph continuity by snapping edges from visible
nodes to ghost nodes and from ghost nodes to the next visible nodes. The first
implementation should use flow-order ranges as the safe, ClickHouse-friendly
projection model.

Incremental materialization should resume from an explicit per-trace source
event checkpoint. Latest read nodes and read edges are useful current state, but
they are not a reliable record of which raw events have been processed.

## Constraints

- **Backend scope**: Work only in `hono-server` — prevents divergence and avoids
  reviving the older backend.
- **Storage**: Use ClickHouse read-optimized tables — the system is append-heavy
  and trace reads need aggregation over large telemetry datasets.
- **Graph model**: Edges are the only graph links — do not infer graph structure
  from node ids, ancestry paths, or start order.
- **Importance semantics**: Threshold mode only — visible means
  `importanceLevel <= selectedThreshold`.
- **Safety**: Read APIs must have hard caps — no request should fetch or return
  an entire million-node trace.
- **Materialization**: Resume from explicit checkpoint rows — do not infer event
  progress from read node/read edge state.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target `hono-server` only | The user explicitly wants the Hono backend and not the older backend. | — Pending |
| Use ClickHouse for read models | Trace data is append-heavy and projection needs fast range reads and aggregations. | — Pending |
| Use importance threshold mode | UI slider should reveal more detail as the threshold increases. | — Pending |
| Generate ghost nodes at read time | Avoid storage explosion from precomputing one projection per importance level. | — Pending |
| Use flow-order ghosting first | Bounded and ClickHouse-friendly; exact graph-component ghosting is too expensive for v1. | — Pending |
| Add edge endpoints to Hono ingestion | Ghost projection cannot snap edges without `fromNodeId` and `toNodeId`. | — Pending |
| Add per-trace materialization checkpoints | Incremental resume needs source-event progress, not just latest read rows. | — Pending |
| Defer pagination/windowing milestone | Current focus is importance projection; windowing is the next scale step. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:
1. Full review of all sections.
2. Core Value check: still the right priority?
3. Audit Out of Scope: reasons still valid?
4. Update Context with current state.

---
*Last updated: 2026-06-04 after initialization*

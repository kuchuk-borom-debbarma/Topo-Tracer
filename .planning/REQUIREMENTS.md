# Requirements: Topo Tracer Hono Read Models

**Defined:** 2026-06-04
**Core Value:** Users can inspect very large traces by importance level without the backend or UI loading the entire trace graph.

## v1 Requirements

### Read Schema

- [ ] **RSCH-01**: Hono edge start ingestion data includes `fromNodeId` and `toNodeId` so read edges can connect two explicit graph nodes.
- [ ] **RSCH-02**: Raw ClickHouse edge event rows persist `from_node_id` and `to_node_id` for edge start events.
- [ ] **RSCH-03**: ClickHouse read node rows store latest node state scoped by `user_id`, `trace_id`, and node id.
- [ ] **RSCH-04**: ClickHouse read node rows store `importance_level` and `flow_order` for threshold projection.
- [ ] **RSCH-05**: ClickHouse read edge rows store latest edge state scoped by `user_id`, `trace_id`, and edge id.
- [ ] **RSCH-06**: ClickHouse read edge rows store `from_node_id`, `to_node_id`, `from_flow_order`, and `to_flow_order` so projection can avoid joining every edge back to every node.
- [ ] **RSCH-07**: ClickHouse trace summary rows store node counts, edge counts, importance bounds, time bounds, materialization time, and diagnostic counts.
- [ ] **RSCH-08**: ClickHouse materialization checkpoint rows store per-trace raw source progress separately from latest read node and read edge rows.
- [ ] **RSCH-09**: Hono read-model types are plain explicit types and live in the correct `api` or `internal` `types.ts` files according to `hono-server/src/code-base.md`.

### Materialization

- [ ] **MAT-01**: `ReadOptimisedAggregator` delegates trace rebuilding to a materialization component instead of keeping rebuild logic inline.
- [ ] **MAT-02**: Materialization loads the current checkpoint for `userId` and `traceId` before reading raw node and edge events.
- [ ] **MAT-03**: Materialization reads only raw events after the stored checkpoint, with deterministic ordering and tie breakers.
- [ ] **MAT-04**: Materialization merges new raw events into existing latest read node and read edge state without requiring a full trace replay for every ingest.
- [ ] **MAT-05**: Materialization computes or updates deterministic `flow_order` for read nodes.
- [ ] **MAT-06**: Materialization writes replacement read node, read edge, and trace summary rows through `ILogReadRepo`, not through direct ClickHouse client access in the worker or service.
- [ ] **MAT-07**: Materialization advances the checkpoint only after all related read rows and summary rows are written successfully.
- [ ] **MAT-08**: Duplicate `log.trace.ingested` delivery does not duplicate latest read state or regress the checkpoint.
- [ ] **MAT-09**: Materialization records diagnostics for malformed graph data such as missing edge starts, missing node endpoints, invalid importance levels, or orphaned edges.

### Ghost Projection

- [ ] **GPRJ-01**: Projection treats a normal node as visible only when `importanceLevel <= selectedThreshold`.
- [ ] **GPRJ-02**: Projection never returns hidden nodes as normal nodes when their `importanceLevel` is greater than the selected threshold.
- [ ] **GPRJ-03**: Projection generates deterministic ghost nodes for hidden flow-order ranges.
- [ ] **GPRJ-04**: Each ghost node reports hidden node count, hidden edge count, node type counts, importance range, time range, and flow-order range.
- [ ] **GPRJ-05**: Visible-to-visible edges are returned as direct projected edges when both endpoints are visible.
- [ ] **GPRJ-06**: Edges touching hidden ranges are snapped through ghost nodes so visible graph continuity is preserved.
- [ ] **GPRJ-07**: Hidden-to-hidden edges inside the same ghost range are aggregated into ghost summary counts rather than returned individually.
- [ ] **GPRJ-08**: Projected edges are aggregated by snapped source, snapped target, and edge type to prevent dense hidden regions from producing unbounded duplicate edges.
- [ ] **GPRJ-09**: Projection response metadata reports the threshold, returned node count, returned edge count, visible node count, ghost node count, materialized timestamp, and whether safety caps were hit.

### Safety And Verification

- [ ] **SAFE-01**: Projection repository methods enforce a maximum number of visible nodes read for one projection operation.
- [ ] **SAFE-02**: Projection repository methods enforce a maximum number of projected edges returned for one projection operation.
- [ ] **SAFE-03**: Projection repository methods do not fetch all nodes or all edges for a trace unless an explicit test fixture proves the trace is within configured safe limits.
- [ ] **SAFE-04**: Projection queries are scoped by `user_id` and `trace_id`.
- [ ] **SAFE-05**: Tests cover duplicate event delivery and prove checkpointed materialization is idempotent.
- [ ] **SAFE-06**: Tests cover late or out-of-order events and document the chosen deterministic ordering behavior.
- [ ] **SAFE-07**: Tests cover ghost projection cases: visible-hidden-visible chains, hidden prefixes, hidden suffixes, all-hidden traces, dense hidden edges, and orphan edges.
- [ ] **SAFE-08**: Logs for materialization and projection include safe summaries such as `userId`, `traceId`, counts, thresholds, caps, and durations, without logging raw node or edge payloads.

## v2 Requirements

### Read APIs

- **RAPI-01**: Hono exposes HTTP routes for trace summaries and projected graph reads.
- **RAPI-02**: Hono read routes translate service errors into stable HTTP responses.
- **RAPI-03**: Hono read routes validate query parameters such as threshold, limits, and cursors.

### Windowing

- **WIND-01**: User can page or window through a very large trace without loading the whole graph.
- **WIND-02**: User can request a focused graph window around a selected node or ghost range.
- **WIND-03**: User can drill into a ghost node to inspect the hidden flow-order range behind it.

### Production Infrastructure

- **INFRA-01**: Event bus uses durable delivery with retry, idempotency, and per-key ordering guarantees.
- **INFRA-02**: Production auth enforces trace ownership for read and write APIs.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New HTTP endpoints/routes in v1 | User requested only core read-optimized and ghost logic for now. |
| Full pagination/windowing UX in v1 | Deferred to the next milestone after read models and ghost projection exist. |
| Exact graph-component ghosting | Arbitrary graph traversal is too expensive and unpredictable for the first ClickHouse read path. |
| Per-threshold projected tables | Traces may have many importance levels, causing storage and rebuild explosion. |
| Complete ancestor arrays on read nodes | The graph is not a bounded tree; ancestor arrays can grow explosively and do not solve snapping cleanly. |
| `carno.js` implementation work | This project targets `hono-server` only. |
| Durable production event bus | Important later, but not required for the first internal read-model milestone. |
| Production auth/security implementation | Reads remain scoped by `userId` in contracts, but auth itself is a separate milestone. |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RSCH-01 | TBD | Pending |
| RSCH-02 | TBD | Pending |
| RSCH-03 | TBD | Pending |
| RSCH-04 | TBD | Pending |
| RSCH-05 | TBD | Pending |
| RSCH-06 | TBD | Pending |
| RSCH-07 | TBD | Pending |
| RSCH-08 | TBD | Pending |
| RSCH-09 | TBD | Pending |
| MAT-01 | TBD | Pending |
| MAT-02 | TBD | Pending |
| MAT-03 | TBD | Pending |
| MAT-04 | TBD | Pending |
| MAT-05 | TBD | Pending |
| MAT-06 | TBD | Pending |
| MAT-07 | TBD | Pending |
| MAT-08 | TBD | Pending |
| MAT-09 | TBD | Pending |
| GPRJ-01 | TBD | Pending |
| GPRJ-02 | TBD | Pending |
| GPRJ-03 | TBD | Pending |
| GPRJ-04 | TBD | Pending |
| GPRJ-05 | TBD | Pending |
| GPRJ-06 | TBD | Pending |
| GPRJ-07 | TBD | Pending |
| GPRJ-08 | TBD | Pending |
| GPRJ-09 | TBD | Pending |
| SAFE-01 | TBD | Pending |
| SAFE-02 | TBD | Pending |
| SAFE-03 | TBD | Pending |
| SAFE-04 | TBD | Pending |
| SAFE-05 | TBD | Pending |
| SAFE-06 | TBD | Pending |
| SAFE-07 | TBD | Pending |
| SAFE-08 | TBD | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 0
- Unmapped: 35

---
*Requirements defined: 2026-06-04*
*Last updated: 2026-06-04 after initial definition*

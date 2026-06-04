# Feature Landscape

**Domain:** Hono read-optimized trace graph projection for very large single traces
**Researched:** 2026-06-04
**Scope:** `hono-server/src` only. `carno.js` is historical context, not the implementation target.
**Overall confidence:** HIGH for milestone behavior from local project requirements and Hono codebase mapping; MEDIUM for exact query-shape details until ClickHouse read tables are designed.

## Table Stakes

Features users and downstream requirements should treat as required for this milestone. Missing any of these means the Hono read model cannot safely support importance-threshold graph reads.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hono graph read endpoint contract | The milestone targets Hono read models, and `hono-server/src/index.ts` currently exposes only `GET /`. A graph projection feature must be reachable through a mounted Hono route. | Medium | Add a thin route that calls the log service public API and translates service errors into stable HTTP responses. Do not put projection or SQL in the route. |
| Trace ownership scoping on reads | Existing Hono ingest events carry `userId`; graph reads must not query by `traceId` alone. | Medium | Every read model table and read query should scope by `user_id` plus `trace_id`. Return not found or forbidden consistently when the pair has no materialized trace. |
| Edge endpoint ingestion fields | Projection cannot preserve graph continuity unless raw edge events include both endpoints. | Medium | Extend Hono `IngestEdgeStart` and ClickHouse edge event rows with `fromNodeId` and `toNodeId`. Edge end events may remain lifecycle-only but must join back to the start endpoint metadata by edge id. |
| Read-optimized latest node model | Very large traces cannot be replayed from raw events per request. | High | Materialize latest node state with `userId`, `traceId`, `id`, `nodeType`, `data`, start/end timing, messages, `importanceLevel`, and `flowOrder`. `importanceLevel` must be required or normalized before projection. |
| Read-optimized latest edge model | Projection needs latest edge state and denormalized endpoint metadata without replaying raw edge events. | High | Materialize latest edge state with `fromNodeId`, `toNodeId`, start/end timing, `edgeType`, and endpoint flow-order fields when available. Orphan edges should be diagnosable and excluded or marked safely. |
| Trace summary read model | The UI and service need cheap metadata before graph reads. | Medium | Materialize counts, min/max importance, timing range, materialization status, and diagnostic counts. Summary should allow the service to validate threshold bounds without scanning all nodes. |
| Explicit per-trace materialization checkpoint | Incremental materialization must resume from source progress, not infer progress from latest read rows. | High | Store checkpoint rows keyed by `user_id` and `trace_id` with last processed source position or timestamp/event tuple for node and edge streams, plus materialized-at and status fields. |
| Incremental materialization from append-only events | Large traces should not require full rebuilds after every ingest batch. | High | `ReadOptimisedAggregator` should process only raw events after the checkpoint, update latest node/edge read rows idempotently, update summary aggregates, then advance the checkpoint after successful writes. |
| Batch coalescing by trace | Existing aggregator already coalesces repeated `log.trace.ingested` events per listener batch; this remains required to avoid repeated work. | Low | Keep per-trace ordering by using `traceId` as event key. Coalescing should not skip unprocessed raw rows because the checkpoint is authoritative. |
| Importance-threshold visibility | This is the core user-facing graph behavior. | Medium | Lower numbers are more important. For selected threshold `T`, visible nodes are exactly nodes with `importanceLevel <= T`. Nodes with `importanceLevel > T` are hidden and summarized, not silently discarded. |
| Threshold validation and clamping | Invalid thresholds must not trigger unbounded or nonsensical queries. | Low | If threshold is omitted, choose a documented default such as the most restrictive useful threshold or trace minimum importance. Clamp to summary min/max and reject non-numeric values with a client error. |
| Flow-order based projection | The first scalable projection model must be ClickHouse-friendly. | High | Use materialized `flowOrder` to query bounded visible milestones and hidden ranges. Do not attempt arbitrary graph traversal or exact component ghosting in this milestone. |
| Ghost nodes for hidden flow-order ranges | Users need to see that detail was collapsed, and where. | High | Generate ghost nodes at read time for contiguous hidden flow-order ranges between visible milestones or window boundaries. Ghost ids should be deterministic for a trace/materialization version/range, not random. |
| Ghost node summary fields | Ghosts must be informative enough for the UI to explain collapsed work. | Medium | Include hidden node count, hidden edge count, node type counts, importance min/max, start/end time range, and flow-order start/end. Include a label/type that the UI can render as collapsed detail. |
| Edge snapping through ghosts | Projection must preserve continuity instead of dropping connections through hidden regions. | High | If an edge touches hidden nodes, snap it to the relevant ghost endpoint when a visible-to-hidden, hidden-to-visible, or hidden-through-hidden path is represented by a hidden range. Visible-to-visible edges remain direct. |
| Ghost edge aggregation | Very dense hidden regions must not produce unbounded duplicate ghost edges. | High | Aggregate projected edges by snapped source, snapped target, and edge type or label. Include counts and timing summary where useful. Enforce response caps after aggregation. |
| Bounded node reads | A single request must never fetch or return an entire million-node trace. | High | Push visible-node filtering, ordering, and limits into ClickHouse. The service must enforce a hard maximum on visible milestones and total returned nodes, including ghosts. |
| Bounded edge reads | Edge reads are often larger than node reads and need their own safety controls. | High | Fetch edges only for the selected bounded flow-order span or bounded endpoint set. Enforce hard scan/return caps and return truncation metadata when caps are hit. |
| Response safety metadata | The UI and tests need to know when the backend intentionally bounded the result. | Medium | Include metadata such as `threshold`, `returnedNodeCount`, `returnedEdgeCount`, `visibleNodeCount`, `ghostNodeCount`, `readLimit`, `truncated`, and `materializedAt`. |
| Materialization freshness metadata | Users should not mistake stale read models for current traces. | Medium | Graph and summary responses should expose materialization checkpoint/freshness status such as `materializedAt`, `lastProcessedEventTime`, and optionally `isMaterializing`. |
| Diagnostics for malformed graph data | Hidden problems such as missing endpoints should be visible to operators and requirements. | Medium | Track orphan edges, missing node starts, missing edge starts, invalid importance, duplicate lifecycle events, and checkpoint lag in summary diagnostics or logs. |
| Idempotent writes | In-memory event bus delivery and retries can duplicate work. | High | Read table writes should tolerate duplicate rebuild attempts for the same source events. Use deterministic logical keys plus materialized version/checkpoint discipline. |
| Stable public API types | The downstream UI should render the backend projection directly. | Medium | Public Hono log API types should distinguish visible trace nodes, ghost nodes, direct edges, and aggregated projected edges without exposing ClickHouse row shapes. |

## Differentiators

Useful behaviors that would improve the product but should be deferred unless the roadmap explicitly expands this milestone.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Full pagination/windowing UX | Lets users navigate very large traces beyond the first bounded projection. | High | Explicitly defer. This milestone may return bounded reads and truncation metadata, but should not design cursor navigation, frontend page controls, or window-management UX. |
| Exact graph-component ghosting | Produces semantically cleaner collapsed graph components than flow-order ranges. | High | Defer because arbitrary graph traversal can be expensive in ClickHouse and risks unbounded reads. Flow-order ghosting is the v1 model. |
| Materialized projection tables per threshold | Fast reads for repeated threshold values. | High | Defer/reject for now because traces may have many importance levels and precomputing every threshold creates storage and invalidation complexity. |
| Expand-on-ghost drilldown | Users could click a ghost and request a more detailed subgraph for that hidden range. | High | Defer to pagination/windowing or focused-range milestone. Current ghost nodes should contain enough metadata to make later drilldown possible. |
| Real-time materialization progress stream | UI can show live progress as huge traces are incrementally materialized. | Medium | Defer. Return freshness metadata in normal read responses first. |
| Durable event bus implementation | Required for production reliability and horizontal scale. | High | Defer unless this milestone expands into production infrastructure. Keep aggregator logic compatible with future durable delivery and duplicate events. |
| Advanced graph quality scoring | Could rank hidden regions by anomaly, duration, or error state. | Medium | Defer. Importance threshold is the only ranking/filtering behavior for this milestone. |
| Frontend graph layout and controls | A polished user workflow around threshold sliders, ghost expansion, and cursors. | High | Defer. This research is for Hono read-model behavior and backend safety constraints. |

## Anti-Features

Things to deliberately avoid in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Implementing in `carno.js` | The milestone explicitly targets `hono-server/src`; changing the older backend would split behavior and confuse roadmap validation. | Use `carno.js` only as historical evidence for behavior. Implement Hono service, repository, schema, and route changes. |
| Serving raw events to the UI | Replaying raw events per graph request is too expensive and duplicates read-model logic in clients. | Serve graph responses from Hono read-optimized tables. |
| Loading all nodes and edges before slicing | This is the known scaling bottleneck and fails the very-large-single-trace requirement. | Push threshold, flow-order, and limit filters into ClickHouse queries. |
| Inferring graph links from node ids, timestamps, or nesting | The project graph model says edges are the only links. Inferred structure will disagree with SDK and future traces. | Require explicit `fromNodeId` and `toNodeId` on edge starts and project only those edges. |
| Treating `importanceLevel >= threshold` as visible | The project defines lower numbers as more important. Reversing this would make the slider semantics wrong. | Use `importanceLevel <= selectedThreshold` for visibility. |
| Dropping hidden nodes without ghosts | Users would see disconnected or misleading graphs and lose evidence that detail exists. | Collapse hidden flow-order ranges into ghost nodes with summary metadata. |
| Returning unlimited ghost detail | Ghosts can become as large as the hidden graph they summarize if all hidden edges/types are returned verbatim. | Aggregate counts and bounded summaries; cap any list-like metadata. |
| Building exact graph traversal in ClickHouse v1 | Component-level collapse can require broad adjacency exploration and unpredictable scans. | Use flow-order ranges and endpoint snapping first. |
| Inferring materialization progress from latest read rows | Latest rows do not prove which raw events have been processed, especially with late or duplicate events. | Maintain explicit per-trace checkpoints. |
| Precomputing all thresholds | Storage and invalidation grow with trace size and importance cardinality. | Generate threshold projection at read time from latest read tables. |
| Exposing repository/internal types as public API | It makes route contracts unstable and leaks ClickHouse implementation details. | Define stable public response types under `services/log/api`. |
| Building pagination/windowing UI now | The user explicitly deferred full pagination/windowing UX beyond this milestone. | Return bounded first projection plus metadata needed for a later windowing phase. |
| Adding production auth as part of graph projection | Hono auth is scaffolded and incomplete; solving it here expands scope. | Scope reads by `userId` as passed through current service boundary and flag auth as a separate security milestone. |

## Feature Dependencies

```text
Mounted Hono log routes -> Graph read endpoint contract
Edge endpoint ingestion fields -> Read-optimized latest edge model -> Edge snapping through ghosts
Read-optimized latest node model -> Importance-threshold visibility -> Ghost node generation
Read-optimized latest edge model -> Ghost edge aggregation
Trace summary read model -> Threshold validation and response metadata
Per-trace materialization checkpoint -> Incremental materialization -> Materialization freshness metadata
Flow-order materialization -> Bounded node reads -> Flow-order ghost ranges
Bounded node reads + bounded edge reads -> Safe graph projection response
Diagnostics capture -> Summary diagnostics -> Operator-visible safety/freshness warnings
```

## MVP Recommendation

Prioritize:

1. Extend Hono ingestion/read schema with edge endpoints, latest read nodes, latest read edges, trace summaries, and materialization checkpoints.
2. Implement checkpoint-driven incremental materialization in `ReadOptimisedAggregator` with idempotent writes and trace-batch coalescing.
3. Add a Hono graph read API that enforces `importanceLevel <= threshold`, hard read caps, flow-order ghost node summaries, snapped/aggregated projected edges, and response safety metadata.

Defer:

- Full pagination/windowing UX: the backend may expose caps and truncation metadata, but cursor navigation and window selection should be a later milestone.
- Exact graph-component ghosting: use flow-order ranges first.
- Per-threshold materialized projection tables: read-time projection avoids storage explosion.
- Ghost drilldown/expansion: preserve range metadata now so a later focused-range endpoint can be added without changing ghost semantics.
- Production auth and durable event bus: important, but separate from this read-model behavior milestone.

## User-Visible Behavior

When a user requests a trace graph with threshold `T`, the Hono backend should return a bounded projected graph where every normal node has `importanceLevel <= T`. Nodes with larger importance values are not returned as normal nodes. Instead, the response includes ghost nodes that summarize hidden flow-order ranges so the user can see where detail was collapsed.

Direct visible-to-visible edges should remain visible. Edges that pass into, out of, or across hidden regions should be projected through ghost nodes so the graph remains connected enough to understand trace flow. The response should distinguish normal nodes from ghost nodes and direct edges from aggregated projected edges.

If the trace is too large for the configured caps, the response should remain safe and finite. It should include explicit metadata that the result was truncated or bounded rather than failing by timeout, scanning the full trace, or returning an enormous payload.

If read materialization has not caught up to ingestion, the graph response should expose freshness metadata. The product can then show that the graph is based on the latest materialized checkpoint, not necessarily every raw event already accepted by ingestion.

## Backend Safety Constraints

| Constraint | Requirement |
|------------|-------------|
| Scope every query | Include `user_id` and `trace_id` in read-model and raw-event queries. |
| Bound node reads | Apply threshold, flow-order ordering, and limits in ClickHouse before mapping rows in TypeScript. |
| Bound edge reads | Restrict edge queries by bounded flow-order span or bounded endpoint set; never read all trace edges for projection. |
| Bound response size | Enforce maximum returned normal nodes, ghost nodes, and projected edges. |
| Bound ghost metadata | Return aggregate counts and capped type summaries, not full hidden node or edge lists. |
| Maintain checkpoints | Advance checkpoint only after read-model writes succeed. |
| Preserve idempotency | Duplicate `log.trace.ingested` events must not duplicate visible read state or regress checkpoints. |
| Avoid `FINAL` dependence | Follow ClickHouse latest-row discipline with explicit version/materialized fields rather than expensive global finalization reads. |
| Log safely | Do not log raw trace payloads, credentials, tokens, or huge graph data; log trace ids, counts, caps, and durations. |
| Fail predictably | Invalid threshold, bad limits, or missing trace state should return stable errors, not framework-default stack traces. |

## Sources

- `.planning/PROJECT.md` - HIGH confidence. Defines active Hono requirements, threshold semantics, ghost-node expectations, bounded read constraints, and explicit out-of-scope items.
- `.planning/codebase/ARCHITECTURE.md` - HIGH confidence for existing architecture and historical `carno.js` behavior; MEDIUM only where used as Hono migration precedent.
- `.planning/codebase/CONCERNS.md` - HIGH confidence for current Hono gaps, performance bottlenecks, and safety risks.
- `hono-server/src/code-base.md` - HIGH confidence for required Hono service/repository/infra boundaries and logging/type conventions.
- `hono-server/src/services/log/*` and `hono-server/src/infra/db/clickhouse/schema.ts` - HIGH confidence for current Hono implementation state: write path exists, aggregator scaffold exists, read repo is empty, edge endpoints are missing, read tables are not yet defined.

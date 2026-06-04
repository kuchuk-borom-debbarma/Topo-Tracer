# Project Research Summary

**Project:** Topo Tracer Hono Read Models
**Domain:** Hono read-optimized trace graph pipeline for very large traces
**Researched:** 2026-06-04
**Confidence:** HIGH

## Executive Summary

This project is a backend read-model milestone for `hono-server`, not a migration or rewrite of the older `carno.js` backend. The product shape is an append-heavy telemetry system where raw node and edge events remain the source of truth, while ClickHouse read tables materialize trace summaries, latest node state, latest edge state, and checkpointed progress so the UI can inspect large traces without replaying raw events.

The recommended approach is to build a contract-driven Hono pipeline under `hono-server/src`: extend edge ingestion with explicit endpoints, add ClickHouse read-optimized tables, materialize incrementally from append-only raw events using explicit per-trace checkpoints, and expose a bounded importance-threshold graph projection API. Visibility must mean `importanceLevel <= threshold`; hidden nodes must be summarized as read-time ghost nodes over flow-order ranges, with edges snapped through ghosts to preserve continuity.

The main risks are unbounded reads disguised as projection logic, incorrect materialization progress, and misleading ghost semantics. Mitigate them by following `hono-server/src/code-base.md`, keeping routes thin, keeping SQL inside repositories, enforcing hard SQL and response caps, storing checkpoint rows separate from latest read state, and preserving the v1 decision to use flow-order ghosting instead of exact graph-component ghosting.

## Key Findings

### Recommended Stack

Keep the existing Hono, TypeScript, Cloudflare Workers, and ClickHouse direction. No new runtime dependency is required for the core milestone. The stack research strongly recommends ClickHouse read tables over Postgres, a graph database, or per-threshold materialized projections because the workload is append-heavy telemetry plus bounded analytical/range reads.

**Core technologies:**
- TypeScript: Hono backend implementation language -- keeps existing typed service and repository boundaries.
- Hono 4.x: HTTP routing and Worker-compatible app shell -- already used by `hono-server`; routes should stay thin.
- Cloudflare Workers / Wrangler: deployment/runtime target -- keep current setup; do not make this milestone depend on a tooling upgrade.
- `@clickhouse/client-web`: ClickHouse HTTP client for Workers/web runtimes -- use the web client package, not the Node package.
- ClickHouse MergeTree: append-only raw node and edge events -- source-of-truth event storage.
- ClickHouse ReplacingMergeTree: latest read nodes, latest read edges, summaries, and current checkpoints -- insert replacement versions, but query with latest-row discipline.

**Critical version notes:**
- Current ClickHouse JS docs require ClickHouse 24.8+ for current client compatibility.
- Optional patch upgrades (`@clickhouse/client-web`, Wrangler, TypeScript) should be handled only if the implementation phase accepts lockfile churn.
- ReplacingMergeTree correctness cannot rely on background merges; repositories must use bounded `FINAL` or grouped latest-row queries such as `argMax`.

### Expected Features

The milestone must deliver backend read behavior that can render large trace projections safely. The UI-facing query is importance-threshold projection, not pagination/windowing UX.

**Must have (table stakes):**
- Hono graph read endpoint contract -- mounted route calling the log service, not direct SQL.
- Trace ownership scoping -- all reads scoped by `user_id` and `trace_id`.
- Edge endpoint ingestion fields -- add `fromNodeId` and `toNodeId` to Hono edge start ingestion and raw edge event storage.
- Latest node read model -- materialize `flow_order`, `importance_level`, timing, type, messages/data, and lifecycle state.
- Latest edge read model -- materialize edge endpoints plus denormalized endpoint flow-order metadata.
- Trace summary read model -- cheap counts, importance bounds, time bounds, freshness, and diagnostics.
- Explicit per-trace materialization checkpoint -- resume from raw source-event progress, never from latest read rows.
- Incremental materialization -- `ReadOptimisedAggregator` processes raw events after checkpoint and advances checkpoints only after read writes succeed.
- Importance-threshold visibility -- normal nodes are visible only when `importanceLevel <= threshold`.
- Read-time ghost nodes -- hidden flow-order ranges produce deterministic ghost nodes with hidden counts, edge counts, type counts, importance range, and time range.
- Edge snapping through ghosts -- visible-hidden and hidden-visible edges project through ghost nodes; hidden-hidden edges are aggregated.
- Bounded node and edge reads -- hard caps at service and repository/query levels.
- Response safety and freshness metadata -- indicate caps, truncation, materialization time, and checkpoint status.

**Should have (competitive but secondary):**
- Diagnostics for malformed graph data -- orphan endpoints, invalid importance, duplicate lifecycle events, checkpoint lag.
- Stable public API types -- separate visible nodes, ghost nodes, direct edges, and projected aggregate edges.
- Idempotent materialization writes -- duplicate event-bus delivery must not corrupt latest state.

**Defer (v2+):**
- Full pagination/windowing UX -- explicitly out of scope for this milestone.
- Exact graph-component ghosting -- deferred because arbitrary traversal is too expensive for the first ClickHouse read path.
- Per-threshold materialized projection tables -- rejected for v1 because storage grows with trace size and importance cardinality.
- Expand-on-ghost drilldown -- preserve range metadata now for a later focused-range endpoint.
- Durable production event bus -- important later, but not a hidden dependency for this read-model milestone.
- Frontend graph layout and controls -- this research targets Hono backend behavior.

### Architecture Approach

Build the read pipeline inside `hono-server/src/services/log` using the existing service/repository pattern. Raw ingestion writes append-only ClickHouse events and publishes `log.trace.ingested`; the read-side aggregator coalesces trace events, replays raw rows after an explicit checkpoint, writes latest read rows and summaries, then advances the checkpoint. Graph projection should be a read-time service/repository operation over bounded ClickHouse rows, not a route-level algorithm and not a precomputed threshold table.

**Major components:**
1. `src/index.ts` Hono routes -- mount telemetry routes, parse HTTP inputs, translate errors, and call public services.
2. `services/log/api` -- stable public request/response types and `ILogService` methods for ingest, summaries, list, and projected graph reads.
3. `LogServiceImpl` -- validates requests, enforces caps, coordinates writes/events/reads, and contains no SQL.
4. `ILogWriteRepo` / `LogWriteRepoClickHouse` -- append-only raw node and edge event persistence, including new edge endpoint fields.
5. `ILogReadRepo` / `LogReadRepoClickHouse` -- checkpoints, raw replay slices, latest read row writes, summaries, and bounded projection queries.
6. `ReadOptimisedAggregator` -- subscribes to `log.trace.ingested`, coalesces by `(userId, traceId)`, and invokes materialization.
7. `ReadModelMaterializer` -- loads checkpoint, folds raw events deterministically, computes latest read state/flow order, saves rows, and commits checkpoint.
8. Ghost projection helper -- derives visible nodes, hidden flow-order ranges, ghost summaries, and projected/snap edges for one threshold.

**Patterns to follow:**
- Follow `hono-server/src/code-base.md` before planning or implementing Hono changes.
- Routes call services; services use repository contracts; repositories own ClickHouse SQL.
- Store `flow_order` on read nodes and denormalized endpoint flow metadata on read edges.
- Use versioned inserts for read models; do not use ClickHouse mutations or request-path `OPTIMIZE FINAL`.
- Generate ghost projections at read time from threshold-independent latest read tables.

### Critical Pitfalls

1. **Unbounded trace reads behind projection logic** -- require explicit limits, bounded flow-order predicates, selected columns, and ClickHouse query caps in every graph read repository method.
2. **Inferring progress from latest read rows** -- add a `trace_materialization_checkpoints` table keyed by `(user_id, trace_id)` with raw event watermarks and materializer version.
3. **Late events corrupting latest state** -- derive state by deterministic source event order and tie-breakers; do not treat materialization time as event truth.
4. **ReplacingMergeTree eventual correctness leaks stale rows** -- centralize latest-row query patterns using bounded `FINAL` or grouped `argMax`; never assume background merges already deduplicated rows.
5. **Incorrect ghost semantics dropping continuity** -- treat thresholding as projection, not filtering; emit deterministic ghosts and snap/aggregate edges through hidden flow-order ranges.
6. **Storage explosion from per-threshold projections** -- materialize latest nodes/edges once and build threshold ghosts on demand.
7. **Missing edge endpoints make projection impossible** -- edge endpoints must be Phase 1 work, before read edges and ghost projection.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Edge Endpoint Ingestion

**Rationale:** Graph projection cannot preserve continuity until Hono raw edge events know their real endpoints.
**Delivers:** `fromNodeId` and `toNodeId` in public Hono edge start types, request validation, raw edge schema, and `LogWriteRepoClickHouse` writes.
**Addresses:** Edge endpoint ingestion fields; trace ownership scoping groundwork.
**Avoids:** Endpoint inference from ids, timestamps, nesting, or flow order.

### Phase 2: ClickHouse Read Tables And Contracts

**Rationale:** Materialization and graph reads need stable storage contracts before worker logic is implemented.
**Delivers:** DDL for latest read nodes, latest read edges, trace summaries, and trace materialization checkpoints; expanded `ILogReadRepo` use-case methods; repo-local row types.
**Uses:** ClickHouse MergeTree for raw events; ReplacingMergeTree for latest read rows and checkpoints; bounded latest-row query discipline.
**Implements:** `flow_order` on nodes, endpoint metadata on edges, trace summaries, and explicit source-event checkpoints.
**Avoids:** Per-threshold projection tables, checkpoint inference from latest rows, mutable fields in replacement keys, overuse of nullable projection-critical columns.

### Phase 3: Checkpointed Incremental Materialization

**Rationale:** Read tables are only useful if they are populated idempotently and can resume after retries or duplicate event-bus delivery.
**Delivers:** `LogReadRepoClickHouse`, `ReadModelMaterializer`, aggregator wiring, deterministic event folding, latest node/edge/summary writes, and monotonic checkpoint advancement.
**Addresses:** Incremental materialization, batch coalescing, idempotent writes, materialization freshness metadata, malformed-data diagnostics.
**Avoids:** Late-event corruption, checkpoint races, raw SQL leaking into services/routes, silent normalization of malformed rows.

### Phase 4: Summary And Latest-State Read APIs

**Rationale:** Summary/list endpoints validate the read side before the more complex projection API, and they give the UI cheap metadata for threshold bounds and freshness.
**Delivers:** `ILogService` methods and Hono routes for trace summaries/listing with user scoping, materialization status, counts, and diagnostics.
**Addresses:** Trace summary read model, threshold validation support, materialization freshness metadata.
**Avoids:** Raw event replay per request and framework-default errors for missing or stale traces.

### Phase 5: Bounded Importance-Threshold Ghost Projection

**Rationale:** This is the core product behavior and depends on edge endpoints, read tables, flow order, endpoint metadata, and materialized summaries.
**Delivers:** `GET` graph projection API that enforces `importanceLevel <= threshold`, bounded visible-node reads, hidden flow-order ghost summaries, projected/snap edges, response caps, truncation metadata, and stable public graph types.
**Addresses:** Importance-threshold visibility, ghost nodes, ghost edge aggregation, bounded node/edge reads, response safety metadata.
**Avoids:** Filtering without ghosts, exact graph-component ghosting in v1, full pagination/windowing UX, and loading whole traces into TypeScript.

### Phase 6: Hardening, Fixtures, And Observability

**Rationale:** The highest risks are correctness under duplicate/late events and accidental full scans; this phase locks down behavior before expanding scope.
**Delivers:** Golden graph fixtures, checkpoint replay tests, duplicate/late lifecycle tests, cap-enforcement tests, malformed endpoint diagnostics, query metrics, and materialization lag/status logging.
**Addresses:** Critical pitfall detection and roadmap confidence gaps.
**Avoids:** Shipping a projection endpoint whose safety depends on manual review rather than executable invariants.

### Phase Ordering Rationale

- Edge endpoints must come first because read edges and ghost snapping cannot be correct without explicit `fromNodeId` and `toNodeId`.
- Read tables and repository contracts should precede materialization so the worker has a durable target and does not invent storage shapes ad hoc.
- Materialization should precede graph APIs because projection must read from ClickHouse read tables, not replay raw events.
- Summary/list reads are a lower-risk checkpoint before graph projection and provide threshold/freshness metadata needed by the projection endpoint.
- The importance-threshold projection should land after flow order, endpoint metadata, checkpoints, and summaries are in place.
- Hardening should close the loop with fixtures and metrics focused on the known failure modes: unbounded scans, stale latest rows, duplicate/late events, and ghost continuity.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** MEDIUM -- exact ClickHouse order keys, skip indexes, and latest-row query shape should be validated against local schema and realistic trace cardinality.
- **Phase 3:** MEDIUM -- incremental materialization with late events and flow-order recompute needs careful fixture design; full-trace recompute may be acceptable initially if bounded.
- **Phase 5:** MEDIUM -- ghost projection SQL and edge candidate queries should be validated in ClickHouse with realistic dense-edge traces.
- **Later durable event bus:** HIGH for production -- current event bus is acceptable for this milestone, but production reliability needs separate queue/replay research.

Phases with standard patterns (skip research-phase unless implementation uncovers surprises):
- **Phase 1:** Hono type/schema/repository extension follows current local patterns.
- **Phase 4:** Service-backed summary/list Hono routes are standard within `hono-server/src/code-base.md`.
- **Phase 6:** Test and observability work is guided by the pitfall fixtures already identified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Hono, Workers, ClickHouse, MergeTree, ReplacingMergeTree, and client package guidance are backed by official docs plus the existing `hono-server` architecture. Exact order-key tuning remains MEDIUM until measured. |
| Features | HIGH | Must-have features come directly from `.planning/PROJECT.md`, current Hono gaps, and the explicit milestone scope. |
| Architecture | HIGH | Boundaries align with `hono-server/src/code-base.md` and existing service/repository/event-bus scaffolding. |
| Pitfalls | HIGH | ClickHouse operational risks are well documented; project-specific ghost semantics are MEDIUM until validated with product fixtures. |

**Overall confidence:** HIGH

### Gaps to Address

- **Raw edge migration:** Determine whether existing local ClickHouse data must be migrated or whether schema recreation is acceptable for this milestone.
- **Stable raw event ordering:** Confirm whether current event timestamp/id/type tuple is sufficient or whether a stable ingestion sequence/event id must be added.
- **Flow-order algorithm:** Define deterministic flow-order assignment and tie-breakers, especially for late events and same-millisecond events.
- **Latest-row query strategy:** Decide per repository method when bounded `FINAL` is acceptable versus grouped `argMax`.
- **Projection caps:** Choose concrete defaults for visible node limit, edge limit, ghost range limit, and ClickHouse query timeout based on local performance.
- **Ghost fixture semantics:** Validate hidden prefixes, hidden suffixes, all-hidden windows, dense hidden edges, and visible-hidden-visible chains.
- **Auth boundary:** Current milestone should scope by `userId` through existing service inputs, but production auth remains a separate security concern.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` -- Hono-only scope, active requirements, out-of-scope decisions, threshold semantics, ghost projection expectations, bounded read constraints.
- `.planning/research/STACK.md` -- recommended Hono/ClickHouse stack, table engines, query discipline, and technologies to avoid.
- `.planning/research/FEATURES.md` -- table stakes, differentiators, anti-features, MVP recommendation, and backend safety constraints.
- `.planning/research/ARCHITECTURE.md` -- service/repository/event-bus/materializer boundaries, data flow, patterns, and build order.
- `.planning/research/PITFALLS.md` -- critical/moderate/minor pitfalls, prevention strategies, phase warnings, and detection guidance.
- `hono-server/src/code-base.md` -- mandatory implementation contract for Hono service boundaries, environment access, repositories, event bus semantics, ClickHouse setup, logging, and types.
- `hono-server/src/services/log/*` and `hono-server/src/infra/db/clickhouse/schema.ts` -- current Hono write path, raw schema, aggregator scaffold, and missing read-side implementation.

### Secondary (MEDIUM/HIGH confidence)
- ClickHouse ReplacingMergeTree docs -- replacement behavior, background merge caveats, and query-time correctness needs.
- ClickHouse MergeTree and primary-key best-practice docs -- ordering-key guidance for trace-scoped reads.
- ClickHouse incremental materialized view docs -- why MVs should not become the general checkpointed graph event processor.
- ClickHouse avoid mutations / avoid optimize final docs -- operational anti-patterns for request-path correctness.
- ClickHouse JavaScript client docs -- use `@clickhouse/client-web` for Workers/web runtimes.
- Hono docs -- route/middleware shape and adapter/env helpers.
- Cloudflare Workers context docs -- `waitUntil` limitations and why durable queues remain a later production concern.

---
*Research completed: 2026-06-04*
*Ready for roadmap: yes*

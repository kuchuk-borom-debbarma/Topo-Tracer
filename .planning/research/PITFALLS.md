# Domain Pitfalls

**Domain:** Hono read-optimized trace graph pipeline with ClickHouse read models
**Researched:** 2026-06-04
**Scope:** Implementation recommendations apply only to `hono-server/src`. Treat `carno.js` as historical context, not as a target for new behavior.
**Overall confidence:** HIGH for ClickHouse operational risks; MEDIUM for graph-specific ghost semantics because they are project-specific and must be validated with product fixtures.

## Critical Pitfalls

Mistakes that cause rewrites, incorrect graph reads, production incidents, or runaway storage.

### Pitfall 1: Unbounded Trace Reads Hidden Behind Projection Logic

**What goes wrong:** The graph endpoint filters by importance threshold in TypeScript after reading all latest nodes and edges for a trace. Large traces then scan and transfer millions of rows to return a small visual projection.

**Why it happens:** Projection feels like business logic, so it is tempting to load read rows into the Hono service and collapse hidden nodes in memory. ClickHouse only stays fast when queries filter on ordering-key columns and read the smallest useful column set.

**Consequences:** Slow requests, worker memory pressure, ClickHouse query spikes, UI timeouts, and accidental full-trace disclosure through oversized responses.

**Warning signs:**
- Repository methods named like `getAllNodesForTrace`, `getAllEdgesForTrace`, or `loadTrace`.
- SQL without `LIMIT`, `max_rows_to_read`, `max_result_rows`, or bounded `flow_order` predicates.
- Graph projection code slices arrays after a broad query.
- Query logs show high `read_rows` or `read_bytes` for ordinary threshold requests.

**Prevention:**
- Phase 2 should define read-table `ORDER BY` keys around the actual read shape: `user_id`, `trace_id`, `flow_order`, and logical ids/version fields where needed.
- Phase 3 should make read repository contracts require explicit `limit`, `flowOrderStart`, `flowOrderEnd`, and `threshold`; no internal method should return an unbounded trace graph.
- Phase 4 should enforce API-level caps in Hono and ClickHouse settings per query, using exception behavior rather than partial results.
- Select only projection columns needed for the response; do not fetch raw payload maps or messages for collapsed ranges.

**Detection:**
- Add tests that fail if projection queries omit hard limits.
- Track ClickHouse `read_rows`, `read_bytes`, elapsed time, and result row count per graph request.
- Alert when a graph request reads more than the configured trace-window budget.

**Phase to address:** Phase 2 schema design and Phase 4 graph endpoint safety.

### Pitfall 2: Inferring Materialization Progress From Latest Read Rows

**What goes wrong:** The aggregator resumes by checking latest node or edge rows instead of a source-event checkpoint. Late, duplicate, or reordered raw events can then be skipped or reprocessed incorrectly.

**Why it happens:** Latest read rows look like convenient progress markers, but they represent current state, not the event stream boundary. Read rows can be rebuilt, replaced, deleted logically, or missing for traces whose raw events have not produced visible state.

**Consequences:** Stale node states, missing edges, incorrect summaries, non-idempotent rebuilds, and materializer loops that cannot distinguish "processed but invisible" from "not processed."

**Warning signs:**
- Checkpoint code queries `max(materialized_at_ms)` from latest node or edge tables.
- Worker state has no per-trace raw event offset, event timestamp watermark, or processed event identity.
- Rebuild logic handles node and edge streams independently with no shared trace-level checkpoint.
- Recovery scans select traces only from read-model tables.

**Prevention:**
- Phase 2 should add a per-trace materialization checkpoint table keyed by `user_id`, `trace_id`, and materializer name/version.
- Checkpoints should store the processed raw-event boundary, materializer schema version, update time, and lag diagnostics.
- Phase 3 should update checkpoints only after read rows for the processed batch are inserted successfully.
- Checkpoint advancement must be monotonic and idempotent; duplicate delivery should be safe.

**Detection:**
- Fixture tests replay events in different batch sizes and assert identical read rows and checkpoint positions.
- Add lag metrics comparing newest raw event timestamp/id to checkpoint.
- Add recovery tests where the process stops after read-row inserts but before checkpoint update.

**Phase to address:** Phase 2 checkpoint schema and Phase 3 aggregator implementation.

### Pitfall 3: Late Events and Event Ordering Corrupt Current State

**What goes wrong:** A late `start` or `end` event arrives after a newer event and overwrites the correct latest state, or an older materialization pass wins because its replacement version is higher than the event it represents.

**Why it happens:** Ingested telemetry is append-only, but event time, ingestion time, and materialization time are different clocks. ClickHouse replacement engines keep rows by version during merges, so choosing the wrong version column makes "latest" nondeterministic or semantically wrong.

**Consequences:** Negative durations, ended nodes becoming active again, edges disappearing or pointing to stale endpoints, and visible/hidden membership changing incorrectly after replay.

**Warning signs:**
- Read-row version uses `Date.now()` only, with no source event identity.
- `argMax` is applied to payload columns using materialization time rather than event order.
- Tests only cover start-before-end insertion order.
- Duplicate raw events produce multiple latest candidates with no deterministic tiebreaker.

**Prevention:**
- Phase 2 should define explicit source event ordering fields for raw node and edge events. If raw tables do not yet have stable event ids, add them before relying on incremental resume.
- Phase 3 should compute current state by source event order, with deterministic tie-breaking by event type and raw event id.
- Read-row replacement version should represent materializer output version, while state derivation should use event order; do not conflate the two.
- Add quarantine or diagnostic rows for impossible lifecycles instead of silently normalizing them.

**Detection:**
- Tests for end-before-start arrival, duplicate start, duplicate end, same-millisecond events, and late correction.
- Metrics for lifecycle anomalies, out-of-order raw events, and checkpoint rewinds.

**Phase to address:** Phase 1 ingestion field completion, Phase 2 schema, and Phase 3 materializer logic.

### Pitfall 4: ReplacingMergeTree Eventual Correctness Leaks Stale Rows

**What goes wrong:** Read tables use replacement inserts for latest nodes and edges, but query code assumes ClickHouse background merges have already removed older row versions.

**Why it happens:** ReplacingMergeTree removes duplicates asynchronously during part merges. Official ClickHouse docs state this gives eventual correctness only; queries can see duplicates or stale rows unless they use query-time deduplication or aggregate by version correctly.

**Consequences:** Duplicate nodes, stale edge endpoints, hidden nodes counted twice, ghost summaries inflated, and inconsistent results between repeated requests.

**Warning signs:**
- Queries select directly from replacement tables without `FINAL`, `argMax`, `argMaxIf`, or equivalent grouping.
- `ORDER BY` does not uniquely identify the logical read row.
- Deleted/tombstoned rows are not filtered.
- Developers run `OPTIMIZE FINAL` manually to "fix" read correctness.

**Prevention:**
- Phase 2 should decide per table whether it is append-only `MergeTree` plus aggregate query, or `ReplacingMergeTree(version, deleted)` plus disciplined read queries.
- If using `ReplacingMergeTree`, make the `ORDER BY` key both query-efficient and unique for the logical row. Keep mutable fields out of the key.
- Phase 3 should centralize latest-row selection in repository methods, not duplicate SQL in services or routes.
- Prefer grouped `argMax` latest-state queries for API paths that cannot tolerate `FINAL` overhead across wide scans.

**Detection:**
- Tests insert multiple replacement versions and assert the repository returns only the newest non-deleted logical row.
- Query review checklist flags raw `SELECT * FROM read_*` paths.
- Monitoring tracks part counts and duplicate logical-row counts.

**Phase to address:** Phase 2 read model table design and Phase 3 read repository implementation.

### Pitfall 5: Incorrect Ghost Semantics Drop Graph Continuity

**What goes wrong:** Hidden nodes are removed without replacement, or edges are connected directly between visible nodes in a way that erases hidden work and misrepresents the trace.

**Why it happens:** Importance threshold projection can be mistaken for filtering. The project requirement is projection: visible means `importanceLevel <= threshold`, while nodes above threshold are collapsed into ghost summaries over flow-order ranges.

**Consequences:** Users believe work did not happen, edge paths appear shorter than reality, hidden failures disappear, and threshold changes produce visually unstable graphs.

**Warning signs:**
- Query predicate is only `importance_level <= threshold` with no hidden-range aggregation.
- Response has visible nodes and original edges only, with no ghost node contract.
- Ghost node ids are random per request.
- Hidden counts do not reconcile with total hidden nodes in the selected window.

**Prevention:**
- Phase 4 should implement a stable ghost contract: deterministic ghost ids from trace id, threshold, range start, and range end.
- Ghost summaries should include hidden node count, hidden edge count, node type counts, importance min/max, and time range.
- Edge projection should snap visible-to-hidden and hidden-to-visible paths through ghost nodes for flow-order ranges; do not claim exact graph-component ghosting in this milestone.
- Keep threshold semantics explicit in public types: visible if `importanceLevel <= selectedThreshold`.

**Detection:**
- Golden fixtures with visible-hidden-visible chains, hidden prefixes, hidden suffixes, adjacent hidden ranges, and all-hidden windows.
- Response invariant checks: visible plus hidden counts reconcile with the bounded source window.
- UI contract tests assert ghost ids remain stable across repeated requests.

**Phase to address:** Phase 4 projection API and repository queries.

### Pitfall 6: Storage Explosion From Per-Threshold Materialized Projections

**What goes wrong:** The backend stores a projected node/edge table for every importance threshold or every slider value.

**Why it happens:** Precomputing feels attractive for fast reads, but traces can have many importance levels and each threshold can duplicate most of the graph.

**Consequences:** Storage grows as `trace_size * threshold_count`, materializer lag increases, backfills become expensive, and schema changes require rebuilding many derived tables.

**Warning signs:**
- Table names or rows include `threshold` for fully projected nodes/edges.
- Materializer loops over all distinct importance levels.
- Insert volume grows sharply with a trace that has many unique importance values.
- Roadmap proposes "materialize all slider stops."

**Prevention:**
- Phase 2 should materialize threshold-independent latest nodes, latest edges, trace summaries, and checkpoints only.
- Phase 4 should generate ghost projection at read time from bounded flow-order windows and aggregate hidden ranges on demand.
- Cache only small, versioned, invalidatable query results if needed later; do not make threshold projections authoritative read models.

**Detection:**
- Storage budget tests estimate row amplification per ingested node/edge.
- Materializer metrics include output rows per input event and fail review if amplification scales with threshold count.

**Phase to address:** Phase 2 schema and Phase 4 projection design.

### Pitfall 7: Edge Endpoint Gaps Make Projection Impossible

**What goes wrong:** Edge read models are built without `fromNodeId` and `toNodeId`, so the graph can list edges but cannot snap them to visible or ghost endpoints.

**Why it happens:** Current Hono raw edge schema records edge id, trace id, event type, timestamp, and edge type, but not source and target node ids. Historical code may have inferred structure elsewhere, but the Hono milestone explicitly says graph links are edges only.

**Consequences:** Ghost edges become guesses, orphan edge counts are wrong, and visible graph continuity cannot be implemented correctly.

**Warning signs:**
- Projection logic derives endpoints from node ids, parent paths, timestamps, or flow order.
- Edge read tables lack denormalized endpoint metadata and endpoint flow orders.
- Tests use edge ids that encode node ids.

**Prevention:**
- Phase 1 must extend Hono edge ingestion request types and raw edge storage with `fromNodeId` and `toNodeId`.
- Phase 2 should denormalize endpoint metadata needed for bounded reads into latest edge rows.
- Phase 3 should quarantine or mark edges whose endpoints are missing from latest node state rather than inventing endpoints.

**Detection:**
- Contract tests reject edge start events without endpoint ids.
- Materializer tests include orphan endpoints and assert diagnostics, not inferred links.

**Phase to address:** Phase 1 ingestion, Phase 2 read schema, and Phase 3 materializer.

### Pitfall 8: Incremental Materialized Views Used As a General Event Processor

**What goes wrong:** ClickHouse materialized views are used to join, order, dedupe, and checkpoint node/edge events as if they were a durable stream processor.

**Why it happens:** ClickHouse incremental materialized views are powerful, but official docs describe them as insert-triggered transformations. For joins, only the left-most source table triggers the view; changes on joined tables do not trigger updates.

**Consequences:** Node events inserted before edge endpoint enrichment produce permanent nulls, late dimension changes are ignored, insert latency rises, and ordering-dependent materialization becomes fragile.

**Warning signs:**
- Materialized view SQL joins node and edge streams to produce current graph state.
- Correctness depends on execution order across several materialized views.
- View logic updates checkpoints or assumes both sides of a join trigger recomputation.
- Heavy JOINs run on every insert block.

**Prevention:**
- Phase 3 should keep ordering, checkpointing, and ghost semantics in the Hono `ReadOptimisedAggregator` service/repository path.
- Use ClickHouse materialized views only for narrow, order-insensitive summaries if they reduce query cost without becoming the source of truth.
- If a view joins a lookup table, ensure the joined data exists before source inserts and document that right-side changes do not trigger recompute.

**Detection:**
- Tests insert joined/right-side data after source rows and verify whether the intended state updates.
- Insert-latency metrics compare ingestion with and without views.

**Phase to address:** Phase 2 stack/schema decisions and Phase 3 materializer implementation.

## Moderate Pitfalls

### Pitfall 1: `OPTIMIZE FINAL` or Mutations Become Operational Crutches

**What goes wrong:** Operators run `OPTIMIZE TABLE ... FINAL`, `ALTER UPDATE`, or large deletes to make read rows correct after materialization bugs.

**Prevention:** Design read models as immutable inserts plus deterministic latest-row queries. Use tombstone rows or replacement versions for logical deletion. Reserve mutations for rare maintenance and monitor `system.mutations`.

**Warning signs:** Runbooks mention `OPTIMIZE FINAL` as routine maintenance; API correctness changes after manual optimization; mutation backlog appears during normal ingestion.

**Phase to address:** Phase 2 schema and operational notes.

### Pitfall 2: Flow Order Is Missing, Unstable, or Non-Unique

**What goes wrong:** Ghost ranges and bounded reads depend on `flow_order`, but the materializer cannot assign a stable order across late events or duplicate node ids.

**Prevention:** Define `flow_order` as part of the read-node contract in Phase 2. It should be deterministic from source event state and have a tie-breaker. Phase 3 should never recompute it differently for already-materialized nodes unless the materializer version changes and triggers a controlled rebuild.

**Warning signs:** Ghost range ids change after replay; ordering falls back to timestamp only; same-millisecond events flicker between requests.

**Phase to address:** Phase 2 schema and Phase 3 materialization.

### Pitfall 3: Checkpoint Writes Race Under Parallel Workers

**What goes wrong:** Multiple Hono instances or concurrent aggregator runs process the same trace and race to advance checkpoints.

**Prevention:** Keep per-trace processing serialized in the worker until idempotency is proven. Use compare-and-advance semantics in the checkpoint repository, or write checkpoint versions that cannot move backwards. Partition worker concurrency by `user_id:trace_id`.

**Warning signs:** Materialization lag moves backwards; duplicate read-row versions appear from two workers; logs show overlapping rebuilds for the same trace.

**Phase to address:** Phase 3 aggregator implementation; durable event bus remains out of scope unless a later phase expands reliability.

### Pitfall 4: Hono Routes Bypass Service and Repository Boundaries

**What goes wrong:** Route handlers build SQL directly or implement projection logic inline.

**Prevention:** Follow `hono-server/src/code-base.md`: routes translate HTTP, services own business orchestration, repositories own ClickHouse SQL. Put graph query contracts in the log service API and private row shapes in `internal/repo/types.ts`.

**Warning signs:** `src/index.ts` imports ClickHouse clients or log internal repository implementations; route files contain projection SQL; public API types expose database-only row fields.

**Phase to address:** Every implementation phase, especially Phase 4 API work.

### Pitfall 5: Silent Normalization of Malformed Rows

**What goes wrong:** Bad JSON, null importance levels, invalid endpoint ids, or non-numeric timestamps are coerced into defaults and then projected as if valid.

**Prevention:** Use explicit row types and runtime guards at repository boundaries. Return diagnostics for malformed raw events and exclude invalid rows from authoritative summaries unless the business rule says otherwise.

**Warning signs:** `any` around ClickHouse result rows; `catch { return {} }`; `Number(value) || 0`; projections include nodes with missing importance semantics.

**Phase to address:** Phase 3 repositories and materializer.

## Minor Pitfalls

### Pitfall 1: Nullable Columns Overused in Hot Read Tables

**What goes wrong:** Hot projection queries pay extra cost and complexity because every commonly filtered field is nullable.

**Prevention:** In Phase 2, make projection-critical columns non-null where the domain requires them: user id, trace id, node id, flow order, importance level for read nodes, edge endpoints for read edges. Use explicit diagnostics for incomplete source events.

**Warning signs:** `Nullable` on fields used in `WHERE`, `ORDER BY`, or ghost grouping; repeated `coalesce` in projection SQL.

**Phase to address:** Phase 2 schema.

### Pitfall 2: Response Size Caps Exist But Scan Caps Do Not

**What goes wrong:** The API returns at most 500 nodes but ClickHouse still scans millions to find them.

**Prevention:** Apply both response caps and scan/query caps. Use ordering-key predicates and ClickHouse settings such as max rows/bytes to read, max result rows, and max execution time with throwing overflow modes.

**Warning signs:** `LIMIT` appears only in the outermost query after broad CTEs; query logs show large reads for small responses.

**Phase to address:** Phase 4 graph endpoint safety.

### Pitfall 3: Materializer Versioning Is Forgotten

**What goes wrong:** Schema or projection semantics change, but existing read rows and checkpoints are interpreted as if they were produced by the new code.

**Prevention:** Store materializer version in checkpoint rows and, where useful, read rows. Phase 3 should refuse to advance incompatible checkpoints without a rebuild path.

**Warning signs:** Migrations change read-row meaning without bumping a version; tests pass only against empty databases.

**Phase to address:** Phase 2 schema and Phase 3 migration/rebuild logic.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: edge endpoint ingestion | Projection implemented before endpoints exist | Add `fromNodeId` and `toNodeId` to Hono request validation and raw edge storage first. |
| Phase 2: ClickHouse read schemas | Wrong ordering key forces full scans or wrong dedupe | Design keys from query shapes: tenant/trace/window first, logical id uniqueness last. |
| Phase 2: checkpoints | Progress inferred from read rows | Add explicit per-trace source checkpoint table and materializer version. |
| Phase 3: incremental aggregator | Late events and duplicates corrupt state | Replay from checkpoints, derive state by source order, and make output inserts idempotent. |
| Phase 3: repository boundaries | SQL leaks into routes/services | Keep ClickHouse access inside `internal/repo/impl` behind contracts. |
| Phase 4: threshold graph API | Filtering mistaken for projection | Generate deterministic ghost nodes and snapped edges for hidden flow-order ranges. |
| Phase 4: read safety | Small response with huge scan | Enforce window predicates, `LIMIT`, ClickHouse query limits, Hono request timeout, and metrics. |
| Later: durable events | In-memory event bus loses materialization triggers | Keep recovery scans and checkpoints; treat durable broker as future infrastructure, not this milestone's hidden dependency. |

## Sources

- Project context: `.planning/PROJECT.md` (HIGH confidence)
- Codebase concerns: `.planning/codebase/CONCERNS.md` (HIGH confidence)
- Hono architecture guide: `hono-server/src/code-base.md` (HIGH confidence)
- Hono current schema and aggregator scaffold: `hono-server/src/infra/db/clickhouse/schema.ts`, `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` (HIGH confidence)
- ClickHouse ReplacingMergeTree docs: https://clickhouse.com/docs/guides/replacing-merge-tree (HIGH confidence)
- ClickHouse incremental materialized view docs: https://clickhouse.com/docs/materialized-view/incremental-materialized-view (HIGH confidence)
- ClickHouse primary key best practices: https://clickhouse.com/docs/best-practices/choosing-a-primary-key (HIGH confidence)
- ClickHouse avoid mutations: https://clickhouse.com/docs/optimize/avoid-mutations (HIGH confidence)
- ClickHouse avoid optimize final: https://clickhouse.com/docs/optimize/avoidoptimizefinal (HIGH confidence)
- Hono timeout middleware: https://hono.dev/docs/middleware/builtin/timeout (MEDIUM confidence; relevant to request timeout prevention, not core graph correctness)

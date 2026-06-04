# Technology Stack

**Project:** Topo Tracer Hono Read Models
**Research type:** Stack dimension for read-optimized trace graph pipeline
**Researched:** 2026-06-04
**Overall confidence:** HIGH for Hono/ClickHouse stack fit and table-engine behavior; MEDIUM for exact order-key tuning until production trace cardinality is measured.

## Recommended Stack

### Core Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | Current project target; npm latest 6.0.3 | Hono backend implementation language | Keep the existing typed service/repository boundaries in `hono-server/src`; no runtime change is needed for this milestone. |
| Hono | 4.12.23 | HTTP routing and Worker-compatible app shell | Already current in npm and already configured for `hono-server`; Hono supports Cloudflare Workers context, env bindings, and `executionCtx.waitUntil` without introducing another framework. |
| Cloudflare Workers / Wrangler | Project uses Wrangler 4.4.0; npm latest 4.97.0 | Deployment/runtime target for `hono-server` | Keep Workers as the target, but upgrade Wrangler in a separate tooling task if needed. Do not make this read-model milestone depend on a Wrangler upgrade. |
| `@clickhouse/client-web` | Project uses 1.19.0; npm latest 1.20.0 | ClickHouse HTTP client for Workers/web runtimes | Use the web client, not `@clickhouse/client`, because the official JS docs identify `@clickhouse/client-web` as the browser/Cloudflare Workers package. Upgrade to 1.20.0 in this milestone only if lockfile churn is acceptable. |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ClickHouse | Client docs require 24.8+ for current JS client compatibility | Primary event and read-model store | Keep ClickHouse. The workload is append-heavy telemetry plus range/aggregate reads over very large traces. Adding Postgres or a graph DB would split the source of truth and add sync failure modes without solving the bounded projection requirement. |
| MergeTree | Built-in ClickHouse engine | Raw append-only node/edge event tables and checkpoint history | Raw event tables should remain append-only. MergeTree physically sorts parts by `ORDER BY`, and the existing Hono tables already use it. |
| ReplacingMergeTree(version_ms) | Built-in ClickHouse engine | Latest read-state rows: trace summaries, latest nodes, latest edges, current materialization checkpoint | Use insert-as-update rows with a monotonic `version_ms`/`materialized_at_ms`. Query correctness must not rely on background merges alone; repositories should use either `FINAL` for bounded point reads or `argMax`/group-by patterns where larger result sets are possible. |
| AggregatingMergeTree | Built-in ClickHouse engine | Optional later rollups only | Do not use it for the core node/edge latest-state tables. It is appropriate when row count is reduced by orders of magnitude using aggregate states; it is useful for future trace-wide histograms, not for preserving per-node/per-edge graph rows. |

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Existing Hono `infra/db/clickhouse` singleton | Local architecture | ClickHouse client initialization | Obeys `hono-server/src/code-base.md`: routes initialize infrastructure, repositories use `getInitializedClickHouseClient`, and services do not construct database clients. |
| Existing event bus contract | Local architecture | In-process aggregation trigger | Keep for the milestone. The project already publishes `log.trace.ingested` after persistence and has `ReadOptimisedAggregator` as a listener scaffold. Production durability can move to Cloudflare Queues later. |
| `common/env.ts` Hono adapter helpers | Local architecture | Runtime config | Use `getEnvValue`/`getStringEnvValue`, not `process.env`, so the same code works under Wrangler/Workers and local development. |

## Prescriptive ClickHouse Model

### Raw Source Tables

Keep `node_events` and `edge_events` as MergeTree append-only tables, but change order keys and fields to support incremental materialization:

```sql
-- Node source events
ENGINE = MergeTree
ORDER BY (user_id, trace_id, timestamp_ms, id, event_type)

-- Edge source events
ENGINE = MergeTree
ORDER BY (user_id, trace_id, timestamp_ms, id, event_type)
```

Why: materialization reads by `(user_id, trace_id)` and resumes from timestamp/event checkpoint order. The current `(user_id, trace_id, id, timestamp_ms, event_type)` shape is better for per-id event history than for batch checkpoint scans. Add a stable ingestion sequence if event timestamp collisions are common; otherwise use `(timestamp_ms, id, event_type)` as the deterministic resume tuple.

Required edge additions:

```sql
from_node_id String
to_node_id String
```

Do not infer graph links from node ids, ancestry paths, or flow order. Edges are the graph contract.

### Latest Node Read Table

Use one row per latest materialized node version:

```sql
CREATE TABLE IF NOT EXISTS read_nodes
(
  user_id String,
  trace_id String,
  node_id String,
  version_ms UInt64,
  flow_order UInt64,
  start_time_ms Nullable(UInt64),
  end_time_ms Nullable(UInt64),
  node_type LowCardinality(Nullable(String)),
  importance_level Int32,
  message Nullable(String),
  data Map(String, String),
  is_open UInt8,
  is_deleted UInt8 DEFAULT 0,
  materialized_at_ms UInt64
)
ENGINE = ReplacingMergeTree(version_ms, is_deleted)
ORDER BY (user_id, trace_id, node_id);
```

Add these data-skipping indexes after baseline correctness:

```sql
ALTER TABLE read_nodes
  ADD INDEX read_nodes_flow_minmax flow_order TYPE minmax GRANULARITY 1;

ALTER TABLE read_nodes
  ADD INDEX read_nodes_importance_minmax importance_level TYPE minmax GRANULARITY 1;
```

Why: `ReplacingMergeTree` gives cheap insert-as-update latest state keyed by node identity. The `ORDER BY` key must remain the deduplication key, not the graph query key, because ClickHouse deduplicates ReplacingMergeTree rows by sorting key. Flow and importance filters are then handled by bounded trace-local queries plus skip indexes. Avoid putting `flow_order` or `importance_level` into the ReplacingMergeTree `ORDER BY`; doing so would make every importance/order change create a different logical row.

Query pattern for visible nodes:

```sql
SELECT *
FROM read_nodes FINAL
WHERE user_id = {user_id:String}
  AND trace_id = {trace_id:String}
  AND importance_level <= {threshold:Int32}
ORDER BY flow_order
LIMIT {node_limit:UInt32}
```

For larger traces where `FINAL` becomes too expensive, use a repository-local `argMax` query grouped by node identity and keep the same service contract. Do not leak the query shape through public API types.

### Latest Edge Read Table

Use a separate latest-state table with endpoint metadata denormalized from read nodes during materialization:

```sql
CREATE TABLE IF NOT EXISTS read_edges
(
  user_id String,
  trace_id String,
  edge_id String,
  version_ms UInt64,
  from_node_id String,
  to_node_id String,
  from_flow_order UInt64,
  to_flow_order UInt64,
  min_flow_order UInt64,
  max_flow_order UInt64,
  edge_type LowCardinality(Nullable(String)),
  start_time_ms Nullable(UInt64),
  end_time_ms Nullable(UInt64),
  is_open UInt8,
  is_deleted UInt8 DEFAULT 0,
  materialized_at_ms UInt64
)
ENGINE = ReplacingMergeTree(version_ms, is_deleted)
ORDER BY (user_id, trace_id, edge_id);
```

Add a minmax skip index on `min_flow_order` and `max_flow_order` after the endpoint fields exist:

```sql
ALTER TABLE read_edges
  ADD INDEX read_edges_min_flow_minmax min_flow_order TYPE minmax GRANULARITY 1;

ALTER TABLE read_edges
  ADD INDEX read_edges_max_flow_minmax max_flow_order TYPE minmax GRANULARITY 1;
```

Why: projected graph reads need to decide whether an edge is visible-visible, visible-hidden, hidden-visible, or hidden-hidden without rejoining every edge to every node. Denormalized endpoint flow order lets the repository fetch candidate edges for bounded flow windows and snap visible endpoints through ghost ranges.

### Trace Summary Read Table

Use ReplacingMergeTree keyed by trace identity:

```sql
CREATE TABLE IF NOT EXISTS trace_summaries
(
  user_id String,
  trace_id String,
  version_ms UInt64,
  node_count UInt64,
  edge_count UInt64,
  open_node_count UInt64,
  open_edge_count UInt64,
  min_importance_level Nullable(Int32),
  max_importance_level Nullable(Int32),
  min_time_ms Nullable(UInt64),
  max_time_ms Nullable(UInt64),
  max_flow_order UInt64,
  materialized_at_ms UInt64
)
ENGINE = ReplacingMergeTree(version_ms)
ORDER BY (user_id, trace_id);
```

Why: trace list and graph safety checks need a cheap single-row summary. It should be updated by the aggregator from source events/checkpoints, not recomputed from raw events per request.

### Materialization Checkpoint Tables

Use an explicit current checkpoint plus optional append-only history:

```sql
CREATE TABLE IF NOT EXISTS trace_materialization_checkpoints
(
  user_id String,
  trace_id String,
  version_ms UInt64,
  last_node_timestamp_ms UInt64,
  last_node_id String,
  last_node_event_type UInt8,
  last_edge_timestamp_ms UInt64,
  last_edge_id String,
  last_edge_event_type UInt8,
  materialized_at_ms UInt64
)
ENGINE = ReplacingMergeTree(version_ms)
ORDER BY (user_id, trace_id);
```

Optional history for debugging/replay:

```sql
CREATE TABLE IF NOT EXISTS trace_materialization_checkpoint_history
(
  user_id String,
  trace_id String,
  batch_id String,
  node_rows_processed UInt64,
  edge_rows_processed UInt64,
  started_at_ms UInt64,
  finished_at_ms UInt64,
  last_node_timestamp_ms UInt64,
  last_edge_timestamp_ms UInt64
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, finished_at_ms, batch_id);
```

Why: roadmap requirements explicitly reject inferring event progress from latest read rows. Checkpoints are source-event progress, and latest read rows are state. Keep them separate.

## Projection and Query Approach

### Importance Threshold

Visible means:

```sql
importance_level <= selected_threshold
```

Lower values are more important. Store `importance_level` as non-null in `read_nodes`; if an input event omits it, materialization should assign a configured default such as `1000` so missing importance never accidentally becomes most important.

### Ghost Summaries

Generate ghosts at read time from hidden flow-order ranges between visible nodes:

1. Fetch bounded visible nodes ordered by `flow_order`.
2. Derive hidden ranges between adjacent visible flow orders and before/after the visible window.
3. Aggregate hidden nodes in each range from `read_nodes FINAL`:

```sql
SELECT
  count() AS hidden_node_count,
  min(importance_level) AS min_importance_level,
  max(importance_level) AS max_importance_level,
  min(start_time_ms) AS min_time_ms,
  max(coalesce(end_time_ms, start_time_ms)) AS max_time_ms,
  groupArray((node_type, cnt)) AS node_type_counts
FROM
(
  SELECT node_type, count() AS cnt
  FROM read_nodes FINAL
  WHERE user_id = {user_id:String}
    AND trace_id = {trace_id:String}
    AND flow_order > {range_start:UInt64}
    AND flow_order < {range_end:UInt64}
    AND importance_level > {threshold:Int32}
  GROUP BY node_type
)
```

4. Aggregate hidden edge counts from `read_edges FINAL` by `min_flow_order`/`max_flow_order` range.
5. Emit synthetic ghost nodes in the service response only. Do not persist per-threshold ghost tables.

Why: materializing every threshold projection explodes storage when traces have many importance levels. Runtime ghost aggregation is bounded by flow ranges and request caps.

### Edge Projection

Project edges in the repository/service layer using read edges with denormalized endpoint metadata:

| Endpoint visibility | Response edge |
|---------------------|---------------|
| visible -> visible | Return original edge. |
| visible -> hidden range | Return edge from visible node to ghost node. |
| hidden range -> visible | Return edge from ghost node to visible node. |
| hidden range -> hidden range | Increment ghost edge summary only; do not emit arbitrary hidden-hidden edges. |

Do not attempt exact graph-component ghosting in this milestone. It requires traversal semantics and potentially unbounded joins. Flow-order ghosting is the ClickHouse-friendly first version and matches the active project context.

### Safety Caps

Repository methods should require explicit caps:

| Cap | Recommended default | Reason |
|-----|---------------------|--------|
| `visible_node_limit` | 2000 | Prevents returning an entire million-node trace when the threshold is high. |
| `edge_limit` | 5000 | Keeps edge projection bounded even for dense traces. |
| `ghost_range_limit` | 2000 | Prevents one request from creating thousands of tiny summaries. |
| `query_timeout_ms` | 5000 to 10000 | Aligns with Workers request economics and prevents runaway ClickHouse scans. |

When caps are hit, return a typed partial response flag and summary counts. Do not silently truncate.

## Hono/Cloudflare Constraints That Matter

| Constraint | Recommendation |
|------------|----------------|
| Runtime bindings | Use `common/env.ts` and Hono adapter helpers. Hono docs show `env(c)` works across Cloudflare, Bun, Node, and other runtimes. |
| Background work | `c.executionCtx.waitUntil` is acceptable only for best-effort post-response work. Cloudflare documents a 30-second post-invocation limit and recommends Queues for guaranteed work. For this milestone, materialization should happen synchronously during explicit aggregator/test flows or best-effort through the existing event bus, with durable queues deferred. |
| Client package | Keep `@clickhouse/client-web`; do not import `@clickhouse/client` in Workers code. |
| Service boundaries | Routes stay thin. Aggregation business logic belongs in `services/log/internal/worker` or service implementation. SQL belongs in repository implementations. ClickHouse client setup stays in `infra/db/clickhouse`. |
| Memory | Use ClickHouse `LIMIT`, bounded ranges, and selected columns. The JS client docs warn that result sets can be loaded into memory with `.json()`/`.text()`, so repository queries must be capped before consumption. |

## What Not To Use

| Do Not Use | Why Not | Use Instead |
|------------|---------|-------------|
| Postgres for read graph tables | The milestone is analytical/range-heavy, not transactional OLTP. Introducing Postgres adds dual-write/sync complexity and a new Worker connection story. | Keep ClickHouse read models. |
| A graph database | The first projection is threshold + flow-order ghosting, not arbitrary graph traversal. A graph DB would create another materialized store and make freshness/checkpointing harder. | Store endpoint ids and endpoint flow metadata in ClickHouse read edges. |
| Per-threshold materialized projection tables | Storage grows with thresholds times traces, and traces may have hundreds of importance levels. | Materialize latest nodes/edges once, generate ghosts at read time. |
| ClickHouse mutations/UPDATE for latest state | Mutations are the wrong write path for high-frequency telemetry state. | Insert replacement rows into ReplacingMergeTree tables. |
| Relying on ReplacingMergeTree background merges for correctness | ClickHouse docs state deduplication occurs during background merges at unknown times and does not guarantee duplicate-free reads. | Use `FINAL` for bounded reads or explicit `argMax`/group-by latest-state queries. |
| `OPTIMIZE FINAL` in request paths | It reads/writes large amounts of data and is operational maintenance, not request logic. | Query-time `FINAL` or aggregation. |
| Materialized views for the core incremental processor | ClickHouse incremental MVs operate on inserted blocks and are excellent for simple insert-time aggregations, but this milestone needs cross-table node/edge endpoint enrichment, explicit per-trace checkpoints, and service-level ghost logic. | Implement incremental materialization in the Hono log service/repository layer. Use ClickHouse MVs later for simple rollups only. |
| `carno.js` implementation patterns | The user scoped this milestone to `hono-server/src`; `carno.js` is historical context only. | Follow `hono-server/src/code-base.md`. |

## Installation

No new runtime dependency is required for the core milestone. Optional patch updates:

```bash
cd hono-server
npm install @clickhouse/client-web@1.20.0
npm install -D wrangler@4.97.0 typescript@6.0.3
```

Use this only if the phase accepts lockfile updates. Otherwise keep the existing checked-in versions and implement the schema/query changes.

## Sources

- Context7: `/websites/hono_dev`, topic "Cloudflare Workers env adapter executionCtx waitUntil" (HIGH confidence).
- Context7: `/clickhouse/clickhouse-js`, topic "client-web Cloudflare Workers web version" (HIGH confidence).
- Context7: `/clickhouse/clickhouse-docs`, topics "ReplacingMergeTree ORDER BY FINAL background merges" and "AggregatingMergeTree incremental materialized views MergeTree ORDER BY" (HIGH confidence).
- Hono Adapter Helper: https://hono.dev/docs/helpers/adapter (HIGH confidence).
- Hono Context API: https://hono.dev/docs/api/context (HIGH confidence).
- Cloudflare Workers Context API: https://developers.cloudflare.com/workers/runtime-apis/context/ (HIGH confidence).
- ClickHouse JS docs: https://clickhouse.com/docs/integrations/javascript (HIGH confidence).
- ClickHouse ReplacingMergeTree docs: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree (HIGH confidence).
- ClickHouse AggregatingMergeTree docs: https://clickhouse.com/docs/engines/table-engines/mergetree-family/aggregatingmergetree (HIGH confidence).
- ClickHouse MergeTree docs: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree (HIGH confidence).
- ClickHouse incremental materialized view docs: https://clickhouse.com/docs/materialized-view/incremental-materialized-view (HIGH confidence).
- npm registry checks on 2026-06-04 for `hono`, `@clickhouse/client-web`, `wrangler`, and `typescript` (HIGH confidence for package latest versions).

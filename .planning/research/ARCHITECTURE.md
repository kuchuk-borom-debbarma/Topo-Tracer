# Architecture Patterns

**Domain:** Hono read-optimized trace graph pipeline
**Project:** Topo Tracer Hono Read Models
**Researched:** 2026-06-04
**Overall confidence:** HIGH for Hono boundaries and ClickHouse read-model direction; MEDIUM for exact SQL details until implemented against local ClickHouse.

## Recommended Architecture

Build the Hono log module as a contract-driven event-ingest and read-model pipeline under `hono-server/src/services/log`. The source of truth remains append-only raw node and edge events. A background materializer consumes `log.trace.ingested` events, resumes each trace from an explicit checkpoint row, and appends new read-model versions into ClickHouse tables optimized for the UI's read shapes.

Do not port or target `carno.js` implementation files. Use them only as historical context for concepts already validated by `.planning/PROJECT.md`: explicit edges, read models, flow order, and ghost nodes. New implementation guidance belongs in `hono-server/src` and must follow `hono-server/src/code-base.md`: thin Hono routes, business logic in services, persistence behind repository contracts, shared infrastructure in `infra`, and no route-to-repository access.

```text
HTTP routes in src/index.ts
  |
  v
services/log/api/ILogService
  |
  v
services/log/internal/service-impl/LogServiceImpl
  |                     |
  | raw append          | read queries
  v                     v
ILogWriteRepo      ILogReadRepo
  |                     |
  v                     v
LogWriteRepoCH     LogReadRepoCH
  |                     |
  v                     v
ClickHouse raw     ClickHouse read tables
tables             + checkpoint table
  |
  v
infra/event-bus IEventBus topic: log.trace.ingested
  |
  v
ReadOptimisedAggregator
  |
  v
ReadModelMaterializer service/helper
  |
  v
ILogReadRepo materialization methods
```

### Opinionated Direction

Use one log service public contract for HTTP-facing operations, two repository contracts for storage responsibilities, and one worker that depends on repository contracts rather than ClickHouse directly. Keep projection at read time, not as precomputed threshold-specific tables. The storage layer should materialize latest trace/node/edge state and summaries, while `ILogReadRepo.getProjectedGraph` should assemble visible nodes, ghost nodes, and projected edges for a specific threshold and safety limit.

This architecture matches:

- Hono's app/middleware routing model, where the app registers routes and middleware while handlers stay small.
- The local Hono code-base guide, which says routes call public services and services depend on repository contracts.
- ClickHouse's strength: physically sorted, read-optimized tables using `ORDER BY` keys aligned with query predicates.

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `src/index.ts` Hono app | Mount telemetry routes, middleware, error translation, env-aware app typing. No business logic or SQL. | `logService`; ClickHouse middleware/init; Hono context |
| `services/log/api/types.ts` | Public request/response types: ingest events, trace summaries, graph projection response. Stable API surface only. | Routes, `ILogService` |
| `services/log/api/ILogService.ts` | Public service contract for ingest and reads. Use object parameters. | Routes, `LogServiceImpl` |
| `LogServiceImpl` | Validate requests, enforce read caps, coordinate raw writes, publish ingest events, delegate read queries. No SQL. | `ILogWriteRepo`, `ILogReadRepo`, `IEventBus`, logger |
| `ILogWriteRepo` | Contract for append-only raw persistence. | `LogServiceImpl`, `LogWriteRepoClickHouse` |
| `LogWriteRepoClickHouse` | Map public ingest objects to raw node/edge event rows and insert into ClickHouse. | ClickHouse infra singleton |
| `ILogReadRepo` | Contract for all read-side persistence: raw event slices since checkpoint, read row upserts/appends, checkpoint reads/writes, projected graph reads. | `LogServiceImpl`, `ReadOptimisedAggregator`, implementation |
| `LogReadRepoClickHouse` | Own ClickHouse SQL for materialization and read queries. Hide row shapes in repo-local types. | ClickHouse infra singleton |
| `ReadOptimisedAggregator` | Subscribe to `log.trace.ingested`, coalesce events by `(userId, traceId)`, call materializer per trace, log failures. | `IEventBus`, materializer/read repo |
| `ReadModelMaterializer` | Pure-ish orchestration for incremental replay: load checkpoint, load raw events after checkpoint, fold into latest state, persist read rows, commit checkpoint. | `ILogReadRepo`, row mappers/projector helpers |
| `TraceReadProjector` or module-local helpers | Deterministic event folding into latest nodes, latest edges, summary, flow order, and diagnostics. No IO. | Materializer only |
| Ghost projection query/helper | Build visible nodes, hidden ranges, ghost summaries, and projected edges for one threshold/window. | `LogReadRepoClickHouse` or a repo-local helper |

## Hono Route Shape

Mount routes explicitly in `src/index.ts` or a small route module imported by `src/index.ts`. Hono supports `app.HTTP_METHOD`, `app.use`, and `app.route`, and middleware runs around endpoint handlers. Use that model for thin handlers:

```typescript
app.post("/telemetry/events", async (c) => {
  const body = await c.req.json();
  await logService.ingestNodesNEdges(toIngestRequest(c, body));
  return c.json({ ok: true }, 202);
});

app.get("/telemetry/traces/:traceId/graph", async (c) => {
  const result = await logService.getProjectedGraph({
    userId: requireUserId(c),
    traceId: c.req.param("traceId"),
    threshold: parseImportance(c.req.query("threshold")),
    limit: parseLimit(c.req.query("limit")),
  });
  return c.json(result);
});
```

Keep parsing and response translation in the route. Put validation, caps, and orchestration in `LogServiceImpl`. Keep direct environment access through `common/env.ts` and ClickHouse access through `infra/db/clickhouse`.

## Service and Repository API Recommendations

### Public Log Service

Extend `ILogService` instead of introducing route-local repositories:

```typescript
export abstract class ILogService {
  abstract ingestNodesNEdges(data: IngestNodesNEdgesRequest): Promise<void>;
  abstract listTraces(data: { userId: string; limit?: number }): Promise<TraceListResponse>;
  abstract getTraceSummary(data: { userId: string; traceId: string }): Promise<TraceSummaryResponse>;
  abstract getProjectedGraph(data: GraphProjectionRequest): Promise<GraphProjectionResponse>;
}
```

### Write Repository

Update edge start types and raw edge rows first. `IngestEdgeStart` must include:

- `fromNodeId: string`
- `toNodeId: string`
- optional `data` or label fields only if the UI needs them in read edges

Without edge endpoints, ghost projection cannot preserve continuity because the read path cannot know which visible nodes should connect through hidden ranges.

### Read Repository

Fill `ILogReadRepo` with operations that reflect use cases, not table names:

```typescript
export abstract class ILogReadRepo {
  abstract getCheckpoint(data: TraceScope): Promise<MaterializationCheckpoint | null>;
  abstract loadRawEventsAfterCheckpoint(data: LoadRawEventsRequest): Promise<RawTraceEventBatch>;
  abstract loadLatestReadState(data: TraceScope): Promise<LatestTraceReadState>;
  abstract saveMaterialization(data: SaveMaterializationRequest): Promise<void>;
  abstract getTraceSummary(data: TraceScope): Promise<TraceSummary | null>;
  abstract listTraces(data: { userId: string; limit: number }): Promise<TraceSummary[]>;
  abstract getProjectedGraph(data: GraphProjectionQuery): Promise<GraphProjectionResponse>;
}
```

The repository implementation should hide ClickHouse row types such as `ReadNodeRow`, `ReadEdgeRow`, `TraceSummaryRow`, and `MaterializationCheckpointRow` in `internal/repo/types.ts`.

## ClickHouse Schema and Data Flow

### Raw Event Tables

Keep raw event tables append-only `MergeTree` tables. Add edge endpoint columns to `edge_events`:

```sql
from_node_id Nullable(String)
to_node_id Nullable(String)
```

Prefer non-nullable endpoint columns for start rows once ingestion validation is in place; nullable is acceptable during migration because end events do not carry endpoint metadata.

Current raw table sort keys are close enough for trace-scoped replay:

```sql
ORDER BY (user_id, trace_id, id, timestamp_ms, event_type)
```

For incremental materialization, queries need all events for one user/trace after a checkpoint. If replay scans become expensive, consider changing new raw tables to:

```sql
ORDER BY (user_id, trace_id, timestamp_ms, event_type, id)
```

That order better matches "give me trace events after checkpoint" scans. Do not change this before measuring or before migration planning, because it affects existing raw tables.

### Read-Optimized Tables

Create read tables in `infra/db/clickhouse/schema.ts`, with exported table names beside existing raw table constants.

#### `trace_read_nodes`

Purpose: latest node state for graph reads, importance filtering, and hidden range summaries.

Recommended engine:

```sql
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id, node_id)
```

Required columns:

- `user_id String`
- `trace_id String`
- `node_id String`
- `node_type String`
- `flow_order UInt64`
- `importance_level Int32`
- `started_at_ms UInt64`
- `ended_at_ms Nullable(UInt64)`
- `duration_ms Nullable(UInt64)`
- `data Map(String, String)`
- `start_message Nullable(String)`
- `end_message Nullable(String)`
- `materialized_at_ms UInt64`

Query latest rows with grouped `argMax` by `materialized_at_ms` rather than assuming background merges have removed older versions. ClickHouse documents that ReplacingMergeTree deduplication happens during background merges at an unknown time and does not guarantee duplicate-free query results without query-time handling.

#### `trace_read_edges`

Purpose: latest edge state with denormalized endpoint metadata so graph projection can avoid broad joins.

Recommended engine:

```sql
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id, edge_id)
```

Required columns:

- `user_id String`
- `trace_id String`
- `edge_id String`
- `edge_type String`
- `from_node_id String`
- `to_node_id String`
- `from_flow_order UInt64`
- `to_flow_order UInt64`
- `from_importance_level Int32`
- `to_importance_level Int32`
- `started_at_ms UInt64`
- `ended_at_ms Nullable(UInt64)`
- `materialized_at_ms UInt64`

Denormalizing endpoint flow order and importance level is intentional. It lets the graph read find candidate edges in bounded flow-order windows and decide whether each endpoint is visible or hidden without joining every edge to every node at read time.

#### `trace_summaries`

Purpose: trace list and summary reads.

Recommended engine:

```sql
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id)
```

Required columns:

- `user_id String`
- `trace_id String`
- `node_count UInt64`
- `edge_count UInt64`
- `started_at_ms Nullable(UInt64)`
- `ended_at_ms Nullable(UInt64)`
- `min_importance_level Nullable(Int32)`
- `max_importance_level Nullable(Int32)`
- `diagnostic_count UInt64`
- `materialized_at_ms UInt64`

#### `trace_materialization_checkpoints`

Purpose: durable resume state for incremental read-model materialization.

Recommended engine:

```sql
ENGINE = ReplacingMergeTree(checkpoint_version)
ORDER BY (user_id, trace_id)
```

Required columns:

- `user_id String`
- `trace_id String`
- `node_event_watermark_ms UInt64`
- `edge_event_watermark_ms UInt64`
- `node_event_watermark_id String`
- `edge_event_watermark_id String`
- `checkpoint_version UInt64`
- `materialized_at_ms UInt64`
- `status String`
- `error_message Nullable(String)`

Use explicit source-event watermarks. Do not infer progress from `trace_read_nodes` or `trace_read_edges`; latest read state says what was materialized, not which raw events were consumed.

## Materialization Checkpoint Flow

Use this exact direction:

```text
LogServiceImpl.ingestNodesNEdges
  -> ILogWriteRepo.ingestNodesNEdges
  -> ClickHouse raw node_events/edge_events
  -> IEventBus.publish(log.trace.ingested)
  -> ReadOptimisedAggregator.run
  -> ReadModelMaterializer.materializeTrace(userId, traceId)
  -> ILogReadRepo.getCheckpoint
  -> ILogReadRepo.loadRawEventsAfterCheckpoint
  -> TraceReadProjector folds events with latest read state
  -> ILogReadRepo.saveMaterialization(read rows + checkpoint)
```

Materialization algorithm:

1. Read checkpoint for `(userId, traceId)`.
2. Load raw node and edge events after the stored `(timestamp_ms, id)` watermarks.
3. If no new events exist, return without writing read rows.
4. Load latest read state for touched node ids and edge ids, or the whole trace for the first implementation if bounded by phase caps.
5. Fold events deterministically by event type and timestamp.
6. Recompute `flow_order` for affected/full trace. For v1, prefer full trace recompute per materialization because edge changes can affect ordering globally.
7. Insert new read-node/read-edge/summary rows with the same `materialized_at_ms`.
8. Insert a checkpoint row with updated raw-event watermarks only after read rows are inserted successfully.

### Checkpoint Correctness Rules

- Checkpoints advance only after read rows are durable.
- Checkpoints are per `(userId, traceId)`, not global.
- Store both timestamp and id watermarks to break ties.
- Worker retries must be idempotent: repeated materialization may insert another read-model version, but latest-row queries still select the newest `materialized_at_ms`.
- A failure before checkpoint insert causes replay of the same raw events on retry, which is acceptable.

## Ghost Projection Data Flow

Ghost projection should be read-time only. Do not precompute one table per threshold or materialize threshold-specific rows. The UI chooses a threshold where visible nodes are:

```text
importance_level <= threshold
```

Lower numbers are more important. Hidden nodes are:

```text
importance_level > threshold
```

### Projection Query Direction

```text
LogServiceImpl.getProjectedGraph
  -> validate userId/traceId/threshold/limit
  -> enforce hard caps
  -> ILogReadRepo.getProjectedGraph
  -> latest read nodes in bounded flow_order range
  -> group hidden nodes into contiguous flow_order ranges
  -> aggregate hidden range stats
  -> latest read edges touching visible nodes or hidden ranges
  -> return visible nodes + ghost nodes + projected edges
```

### Read-Time Projection Model

Use flow-order ranges as the first projection model:

1. Query latest nodes for `(userId, traceId)` ordered by `flow_order` with a hard `LIMIT`.
2. Split the ordered nodes into visible nodes and contiguous hidden ranges.
3. For each hidden range, create one ghost node with:
   - stable id such as `ghost:${traceId}:${startFlowOrder}:${endFlowOrder}:${threshold}`
   - `hiddenNodeCount`
   - `hiddenEdgeCount`
   - `nodeTypeCounts`
   - `minImportanceLevel` and `maxImportanceLevel`
   - `startedAtMs` and `endedAtMs` range
   - `startFlowOrder` and `endFlowOrder`
4. Query latest edges whose endpoint flow orders fall inside the bounded window or touch visible nodes around it.
5. For each edge:
   - visible -> visible: return the original edge.
   - visible -> hidden: connect visible node to the matching ghost.
   - hidden -> visible: connect matching ghost to visible node.
   - hidden -> hidden in same ghost: count it in ghost summary; do not return as a graph edge.
   - hidden -> hidden across two ghosts: return ghost-to-ghost only if both ghosts are in the response and the edge count does not exceed caps.

This preserves graph continuity without arbitrary graph traversal. It is intentionally less exact than component-level ghosting, but it is bounded and ClickHouse-friendly.

### Safety Caps

`LogServiceImpl` should clamp before repository calls:

- maximum node scan count per projection request
- maximum returned visible nodes
- maximum returned ghost nodes
- maximum returned projected edges
- maximum threshold range or explicit threshold validation

`ILogReadRepo.getProjectedGraph` should also enforce SQL `LIMIT`s. Service caps protect intent; repository caps protect storage.

## Patterns to Follow

### Pattern 1: Service Owns Orchestration, Repos Own SQL

**What:** Routes call `ILogService`; `LogServiceImpl` validates and coordinates; repositories execute ClickHouse calls.
**When:** Every ingest, summary, list, and graph endpoint.
**Example:**

```typescript
await this.writeRepo.ingestNodesNEdges(data);
await this.eventBus.publish(events);
return this.readRepo.getProjectedGraph(query);
```

### Pattern 2: Read Models Are Versioned Inserts

**What:** Insert new read rows with a `materialized_at_ms` version instead of mutating rows in place.
**When:** Node latest state, edge latest state, trace summary, checkpoint rows.
**Why:** ClickHouse is append-oriented, and ReplacingMergeTree supports duplicate cleanup by sorting key plus version. Query logic must still select latest versions because background merges are eventual.

### Pattern 3: Explicit Flow Order For Bounded Graph Reads

**What:** Store `flow_order` on nodes and denormalized `from_flow_order`/`to_flow_order` on edges.
**When:** Any graph projection endpoint.
**Why:** Flow-order windows let the repository limit scans and group hidden ranges without loading a whole million-node trace.

### Pattern 4: Read-Time Ghost Projection

**What:** Build ghost nodes from hidden flow-order ranges at query time.
**When:** The UI passes an importance threshold.
**Why:** Threshold count can grow with trace data; precomputing projections per threshold creates storage and invalidation complexity.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Treating `carno.js` As The Implementation Target

**What:** Editing or planning implementation under `carno.js/src/services/log`.
**Why bad:** This milestone explicitly targets the Hono backend under `hono-server/src`; reviving the old backend creates divergence.
**Instead:** Implement Hono contracts and repositories under `hono-server/src/services/log`.

### Anti-Pattern 2: Inferring Graph Links From Node Order

**What:** Connecting nodes by id, start time, nesting, or flow order.
**Why bad:** Edges are the only graph links. Ghost projection needs real `fromNodeId` and `toNodeId`.
**Instead:** Add endpoint fields to edge ingestion and raw edge storage before read projection.

### Anti-Pattern 3: Using Latest Read Rows As A Checkpoint

**What:** Deciding materialization progress by reading max `materialized_at_ms` or latest node rows.
**Why bad:** Latest read state does not prove which raw event ids/timestamps were processed.
**Instead:** Use `trace_materialization_checkpoints` keyed by `(userId, traceId)`.

### Anti-Pattern 4: Relying On ReplacingMergeTree Background Merges For Correct Reads

**What:** Querying read tables as if old versions disappeared immediately.
**Why bad:** ClickHouse documents ReplacingMergeTree deduplication as background, eventual behavior.
**Instead:** Use grouped `argMax` or query-time deduplication patterns for latest rows. Avoid broad `FINAL` on large graph reads unless measured and bounded.

### Anti-Pattern 5: Unbounded Graph Projection

**What:** Loading every latest node and edge for a trace and filtering in TypeScript.
**Why bad:** The core product requirement is large trace inspection without loading the whole graph.
**Instead:** Apply flow-order windows, threshold filters, aggregation, and SQL limits in the repository.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Raw ingestion | Direct batch inserts are fine. | Batch size and part count need monitoring. | Durable queue/event bus and ingestion backpressure required. |
| Materialization | Full trace recompute per dirty trace is acceptable. | Incremental checkpointing becomes important; bounded parallelism across traces. | Partitioning/sharding and async materialization lag metrics required. |
| Read tables | ReplacingMergeTree with latest-row queries is enough. | Query patterns need strict `ORDER BY` alignment and caps. | Pre-aggregated summaries and possibly additional projection tables by access pattern. |
| Ghost projection | TypeScript post-processing over bounded rows is fine. | Push hidden range aggregation into SQL. | Windowed/paginated graph API becomes mandatory. |
| Event bus | Current dev bus works for local development. | Durable delivery needed before multi-instance deployment. | Ordered per-trace consumer groups and replay tooling needed. |

## Suggested Build Order and Dependencies

1. **Edge endpoint ingestion**
   - Add `fromNodeId` and `toNodeId` to public Hono edge start types.
   - Add raw edge event row/schema columns.
   - Update `LogWriteRepoClickHouse`.
   - Dependency: required before any real graph projection.

2. **Read table schema and repository contracts**
   - Add read node, read edge, trace summary, and checkpoint DDL to `infra/db/clickhouse/schema.ts`.
   - Expand `ILogReadRepo` with checkpoint, raw replay, save, summary, list, and projection methods.
   - Dependency: required before worker implementation.

3. **Materializer checkpoint path**
   - Add `LogReadRepoClickHouse`.
   - Implement `ReadModelMaterializer`.
   - Wire it into `ReadOptimisedAggregator`.
   - Use full trace recompute first if simpler, but still commit explicit checkpoints.
   - Dependency: requires edge endpoints and read schema.

4. **Summary and latest-state read APIs**
   - Extend `ILogService` with trace list and summary methods.
   - Mount Hono routes in `src/index.ts`.
   - Dependency: requires read table writes.

5. **Importance-threshold ghost projection**
   - Implement `getProjectedGraph` with service caps, bounded latest-node queries, hidden range aggregation, and projected edges.
   - Dependency: requires `flow_order` on read nodes and endpoint metadata on read edges.

6. **Hardening and observability**
   - Add materialization lag/status fields.
   - Add retry/error handling for worker failures.
   - Add tests around checkpoint replay, endpoint projection, and cap enforcement.
   - Dependency: follows working vertical path.

## Research Flags for Roadmap

| Phase Topic | Flag | Reason |
|-------------|------|--------|
| Edge endpoint migration | MEDIUM | Existing raw edge table lacks endpoints; migration strategy depends on whether local data must be preserved. |
| Incremental materialization | MEDIUM | Full recompute is safer initially, but true incremental flow-order recompute can get complex when late events arrive. |
| Ghost projection SQL | MEDIUM | Exact SQL should be validated against ClickHouse with realistic trace sizes. |
| Durable event bus | HIGH for production, LOW for local milestone | Current dev event bus is not durable; acceptable for this milestone if production deployment is out of scope. |
| Windowed graph API | Deferred | Explicitly out of scope now, but necessary once traces exceed projection caps. |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Hono boundaries | HIGH | Verified against `hono-server/src/code-base.md` and current Hono docs for route/middleware app shape. |
| ClickHouse table direction | HIGH | MergeTree/ORDER BY and ReplacingMergeTree version behavior are verified in official ClickHouse docs. |
| Checkpoint flow | HIGH | Follows project requirement to use explicit per-trace source-event checkpoints. |
| Ghost projection model | MEDIUM | Flow-order ghosting is project-approved and bounded, but exact query plans need implementation-time validation. |
| Build order | HIGH | Dependencies are directly implied by current missing endpoint fields and absent read tables. |

## Sources

- Local project context: `.planning/PROJECT.md` (2026-06-04)
- Local codebase map: `.planning/codebase/ARCHITECTURE.md` (2026-06-04)
- Local structure map: `.planning/codebase/STRUCTURE.md` (2026-06-04)
- Hono server architecture guide: `hono-server/src/code-base.md`
- Current Hono API docs: https://hono.dev/docs/api/hono
- Current Hono middleware docs: https://hono.dev/docs/guides/middleware
- ClickHouse MergeTree docs: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree
- ClickHouse ReplacingMergeTree docs: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree
- ClickHouse `argMax` docs: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax

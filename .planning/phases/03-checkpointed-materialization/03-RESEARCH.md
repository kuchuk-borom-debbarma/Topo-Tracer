# Phase 3: Checkpointed Materialization - Research

**Researched:** 2026-06-05
**Domain:** Hono read-model materialization, ClickHouse replacement rows, deterministic graph folding
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Late Event Policy

- **D-01:** Materialization should rely on the message broker/event bus to
  preserve trace-local delivery order. Phase 3 should not try to compensate for
  a broker that delivers older raw writes after newer raw writes for the same
  trace.
- **D-02:** The checkpoint remains the source-progress boundary. Materialization
  reads raw rows after the stored checkpoint and should not rediscover older raw
  rows behind the checkpoint.
- **D-03:** If a processed event has lifecycle timing that appears earlier than
  related state, materialization should merge it when possible and increment
  named diagnostics such as clock skew, negative duration, or missing lifecycle
  counts instead of failing the whole trace.
- **D-04:** The planner should verify the existing raw ordering fields are
  sufficient for deterministic resume. If raw insertion order is needed beyond
  lifecycle timestamps and ids, call that out clearly before implementation.

### Flow Order Rules

- **D-05:** `flowOrder` is a stable linear projection of the explicit edge graph.
  It is not depth, parentage, a tree path, or a relationship inferred from node
  ids.
- **D-06:** Prefer a deterministic topological ordering built from explicit
  edges. For branching, sibling nodes should be ordered by `startedAt`, then by
  stable node id.
- **D-07:** Disconnected nodes should be appended in deterministic `startedAt`,
  then node id order.
- **D-08:** If cycles or conflicting ordering inputs are present, materialization
  should keep a deterministic fallback order and increment cycle or malformed
  graph diagnostics. It should not block the entire trace just because one part
  of the graph cannot be topologically ordered.
- **D-09:** The flow-order output must be stable enough for later ghost
  projection to produce repeatable hidden flow-order ranges.

### Malformed Graph Diagnostics

- **D-10:** Use "diagnose and continue" as the v1 policy. Materialize valid
  nodes, edges, and summaries; omit or degrade invalid pieces as needed; record
  the issue through named diagnostic counts.
- **D-11:** Missing starts, missing ends, orphan edges, invalid importance,
  negative durations, cycles, and clock skew should remain observable through
  summary diagnostics.
- **D-12:** Unknown edge endpoints should not be validated at ingestion time.
  Phase 3 materialization should diagnose orphan edges because node and edge
  events may arrive in different batches.

### Retry And Partial Write Semantics

- **D-13:** Use idempotent rewrite with checkpoint-last semantics. Save read
  nodes, read edges, and trace summary first; save the checkpoint only after
  those writes succeed.
- **D-14:** If checkpoint saving fails after read rows were written, the next
  retry should safely rewrite replacement/version rows and then attempt the
  checkpoint again. This fits the append-heavy ClickHouse design.
- **D-15:** Never advance a checkpoint before related read rows and summaries are
  persisted.
- **D-16:** Do not introduce transaction-like staging unless the planner finds a
  concrete ClickHouse/runtime issue that the idempotent rewrite approach cannot
  handle.

### Technical Documentation

- **D-17:** Each phase should add technical documentation explaining what was
  built, why it exists, and how it works. This is important because the user
  needs to understand the whole system over time.
- **D-18:** Phase 3 should document the materialization flow in enough detail to
  explain checkpoint loading, raw event ordering, merge behavior, flow-order
  generation, diagnostic handling, write ordering, retry behavior, and worker
  delegation.
- **D-19:** Documentation should be technical and concrete, not just a summary.
  It should reference the relevant Hono files and the data movement through
  repository contracts.

### Scope Locks

- **D-20:** Do not add Hono HTTP routes in this phase. v1 read routes remain out
  of scope.
- **D-21:** Do not add bounded projection repository methods in this phase unless
  they are strictly required to keep materialization contracts coherent. Phase 4
  owns bounded projection data access.
- **D-22:** Do not add ghost projection logic in this phase. Phase 5 owns ghost
  projection behavior.
- **D-23:** Do not touch `carno.js`, frontend, or SDK code for this phase.

### the agent's Discretion

- The planner may choose the exact materialization component name and file split
  as long as `ReadOptimisedAggregator` delegates trace rebuild work rather than
  owning the folding logic inline.
- The planner may choose the precise deterministic topological-sort algorithm,
  provided it uses explicit edges only and has stable tie breakers for branches,
  disconnected nodes, and malformed graphs.
- The planner may decide whether to extend `ILogReadRepo` directly or add a
  companion raw-read method/contract, but services and workers must not access
  ClickHouse directly.
- The planner may decide the exact documentation file names and placement, as
  long as Phase 3 technical behavior is documented for human understanding.

### Deferred Ideas (OUT OF SCOPE)

- Broker durability, retries, and per-key ordering guarantees beyond the
  development event bus are deferred to production infrastructure work.
- Bounded projection reads are deferred to Phase 4.
- Ghost projection logic is deferred to Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAT-01 | `ReadOptimisedAggregator` delegates trace rebuilding to a materialization component instead of keeping rebuild logic inline. | Use `ReadOptimisedAggregator.rebuildTrace` as the delegation point and inject a materializer dependency. [VERIFIED: hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts] |
| MAT-02 | Materialization loads the current checkpoint for `userId` and `traceId` before reading raw node and edge events. | `ILogReadRepo.loadCheckpoint` exists and the ClickHouse implementation currently throws a Phase 3 placeholder. [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts] |
| MAT-03 | Materialization reads only raw events after the stored checkpoint, with deterministic ordering and tie breakers. | Checkpoint fields store timestamp, id, and event type for node and edge streams; raw rows expose nullable lifecycle timestamps and event ids/types. [VERIFIED: hono-server/src/services/log/api/types.ts] [VERIFIED: hono-server/src/services/log/internal/repo/types.ts] |
| MAT-04 | Materialization merges new raw events into existing latest read node and read edge state without requiring a full trace replay for every ingest. | `ILogReadRepo.loadLatestReadModel` already exposes latest nodes, edges, and summary for incremental merge input. [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] |
| MAT-05 | Materialization computes or updates deterministic `flow_order` for read nodes. | Project docs require `flowOrder` from explicit edges, and Phase 3 CONTEXT locks stable topological ordering plus deterministic fallbacks. [VERIFIED: docs/TRACE_DESIGN.md] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| MAT-06 | Materialization writes replacement read node, read edge, and trace summary rows through `ILogReadRepo`, not direct ClickHouse client access. | Hono guide requires persistence behind repository contracts; `ILogReadRepo.saveReadModel` is the existing write boundary. [VERIFIED: hono-server/src/code-base.md] [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] |
| MAT-07 | Materialization advances the checkpoint only after all related read rows and summary rows are written successfully. | Phase 3 CONTEXT locks checkpoint-last write order, and `saveReadModel` and `saveCheckpoint` are separate contract calls. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] |
| MAT-08 | Duplicate `log.trace.ingested` delivery does not duplicate latest read state or regress the checkpoint. | Read tables and checkpoint table use versioned replacement rows; ClickHouse docs warn replacement dedupe is eventual, so tests must verify latest-state queries use grouped latest-version selection rather than relying on background merges. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree] |
| MAT-09 | Materialization records diagnostics for malformed graph data such as missing edge starts, missing node endpoints, invalid importance levels, or orphaned edges. | Public summary type and trace summary DDL already define named diagnostic counters for missing starts, missing ends, negative durations, cycles, orphan edges, invalid importance, and clock skew. [VERIFIED: hono-server/src/services/log/api/types.ts] [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] |
</phase_requirements>

## Summary

Phase 3 should add a narrow materialization component under `hono-server/src/services/log/internal` that owns folding raw rows into latest read nodes, read edges, trace summaries, diagnostics, and checkpoints. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] The worker should remain an event-bus adapter that coalesces trace events and delegates one trace at a time. [VERIFIED: hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts]

The planner should keep ClickHouse access inside repository implementations and extend the repository surface just enough for materialization to read raw rows after checkpoint bookmarks and load grouped latest read state. [VERIFIED: hono-server/src/code-base.md] [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] The largest planning risk is not the materializer algorithm; it is query/load correctness around replacement rows, checkpoint tie breakers, and current DDL/type mismatches such as `read_nodes.scope` existing in DDL but not in `ReadNodeRow` or mapper output. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [VERIFIED: hono-server/src/services/log/internal/repo/types.ts] [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts]

**Primary recommendation:** Implement `TraceReadModelMaterializer` behind repository contracts, add raw-after-checkpoint repository methods with deterministic `(eventTime, id, eventType)` ordering, write read rows before checkpoints, and add Bun tests for duplicate delivery, checkpoint save failure retry, diagnostics, and stable `flowOrder`. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] [VERIFIED: .planning/REQUIREMENTS.md]

## Project Constraints (from AGENTS.md)

- Work only in `hono-server`; do not implement new backend behavior in `carno.js`. [VERIFIED: AGENTS.md]
- Read and follow `hono-server/src/code-base.md` before Hono implementation recommendations. [VERIFIED: AGENTS.md] [VERIFIED: hono-server/src/code-base.md]
- Use ClickHouse read-optimized tables for read-side state. [VERIFIED: AGENTS.md]
- Treat edges as the only graph links; do not infer graph structure from node ids, ancestry paths, or start order. [VERIFIED: AGENTS.md] [VERIFIED: docs/TRACE_DESIGN.md]
- Use threshold semantics later where visible means `importanceLevel <= selectedThreshold`; do not add ghost projection in Phase 3. [VERIFIED: AGENTS.md] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
- Read APIs must have hard caps, but Phase 3 does not add read routes or bounded projection methods. [VERIFIED: AGENTS.md] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
- Materialization must resume from explicit checkpoint rows and must not infer event progress from read node or read edge state. [VERIFIED: AGENTS.md] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
- Hono services/workers must depend on repository contracts and must not call ClickHouse clients directly. [VERIFIED: hono-server/src/code-base.md]
- Hono code uses public types in `api`, private repo/row types under `internal`, safe `tslog` child loggers, relative imports, two-space indentation, double quotes, and semicolons. [VERIFIED: AGENTS.md] [VERIFIED: hono-server/src/code-base.md]
- After Hono source changes, run `bun run fallow` from `hono-server`. [VERIFIED: hono-server/src/code-base.md] [VERIFIED: hono-server/package.json]
- No project skills were found in `.codex/skills/` or `.agents/skills/`. [VERIFIED: project skills discovery]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Event-bus subscription and trace coalescing | API / Backend worker | Infrastructure event bus | `ReadOptimisedAggregator` subscribes to `log.trace.ingested` through `IEventBus` and coalesces duplicate trace payloads before trace work. [VERIFIED: hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts] |
| Checkpoint loading and saving | Database / Storage repository | API / Backend materializer | Checkpoint rows live in ClickHouse, but materializer owns the source-progress semantics and write order. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| Raw-event reads after checkpoint | Database / Storage repository | API / Backend materializer | Services/workers must not query ClickHouse directly, so deterministic raw reads belong behind a repository contract. [VERIFIED: hono-server/src/code-base.md] |
| Lifecycle merge into latest state | API / Backend materializer | Database / Storage repository | Folding starts/ends, diagnostics, and summary math are business logic; repositories only load/save typed rows. [VERIFIED: hono-server/src/code-base.md] |
| `flowOrder` computation | API / Backend materializer | Database / Storage read rows | `flowOrder` is derived from explicit edge graph semantics and then persisted on read-node/read-edge rows. [VERIFIED: docs/TRACE_DESIGN.md] [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] |
| Replacement read-row persistence | Database / Storage repository | API / Backend materializer | `ILogReadRepo.saveReadModel` is the existing boundary for read nodes, read edges, and trace summary rows. [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] |
| Phase 3 technical documentation | Project docs | API / Backend source references | CONTEXT locks concrete docs explaining checkpoint flow, raw ordering, merge behavior, diagnostics, retry behavior, and worker delegation. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | Configured by `hono-server/tsconfig.json` | Strict source language for Hono service and repository code. | Existing Hono package uses TypeScript with bundler resolution and no path aliases. [VERIFIED: hono-server/tsconfig.json] |
| Hono | 4.12.23 installed; 4.12.23 npm latest checked 2026-06-05 | HTTP app and Worker runtime framework. | Existing app entry point is Hono and this phase should not change routing. [VERIFIED: hono-server/package.json + npm registry] |
| `@clickhouse/client-web` | 1.19.0 installed; 1.20.0 npm latest checked 2026-06-05 | Workers-compatible ClickHouse client used by repositories. | Existing infra uses `createClient` from `@clickhouse/client-web`; official docs describe JSONEachRow insert/query APIs. [VERIFIED: hono-server/package.json + npm registry] [CITED: https://clickhouse.com/docs/integrations/javascript] |
| ClickHouse `ReplacingMergeTree(materialized_at_ms)` | Existing DDL | Versioned latest-state rows for nodes, edges, summaries, and checkpoints. | Project schema already uses replacement rows; ClickHouse docs state replacement is keyed by `ORDER BY` and the largest version wins when `ver` is specified. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree] |
| Bun test runner | Bun 1.3.5 available | Unit and fake-client tests. | Existing tests import `bun:test`, and Bun docs support TypeScript test files discovered by `*.test.ts`. [VERIFIED: codebase grep] [CITED: https://bun.com/docs/test] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tslog` | 4.10.2 installed; 4.10.2 npm latest checked 2026-06-05 | Structured logger with child loggers. | Use in materializer/repo/worker logs with safe ids and counts only. [VERIFIED: hono-server/package.json + npm registry] [VERIFIED: hono-server/src/code-base.md] |
| Fallow | 2.88.1 installed; 2.88.3 npm latest checked 2026-06-05 | Hono code audit gate. | Run `bun run fallow` after source changes, as required by the Hono guide. [VERIFIED: hono-server/package.json + npm registry] [VERIFIED: hono-server/src/code-base.md] |
| Wrangler | 4.97.0 local command; 4.98.0 npm latest checked 2026-06-05 | Cloudflare Worker dev/deploy CLI. | Not needed for Phase 3 unit tests unless implementation touches Worker runtime wiring. [VERIFIED: local tool probe + npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `ILogReadRepo` for raw reads | Add `ILogRawReadRepo` or `ILogMaterializationSourceRepo` | A separate contract avoids mixing raw source reads with read-model writes, but `ILogReadRepo` is already the Phase 3 materialization boundary and the user left the exact contract split to planner discretion. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| Grouped `argMax` latest reads | `SELECT ... FINAL` on `ReplacingMergeTree` | `FINAL` gives query-time dedupe but ClickHouse docs warn replacement dedupe is eventual and `FINAL` has query-time cost; existing project docs prefer grouped `argMax(..., materialized_at_ms)` for hot paths. [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree] [VERIFIED: docs/TRACE_DESIGN.md] |
| Hand-written in-worker folding | Dedicated `TraceReadModelMaterializer` class | Worker-owned folding would violate MAT-01; a class keeps event handling separate from business materialization logic. [VERIFIED: .planning/REQUIREMENTS.md] |

**Installation:**

```bash
# No new packages should be installed for Phase 3. [VERIFIED: research scope]
```

**Version verification:** Existing package versions were checked through local package metadata and `npm view` on 2026-06-05. [VERIFIED: npm registry]

## Package Legitimacy Audit

No new external packages are recommended or required for this phase. [VERIFIED: research scope]

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| none | — | — | — | — | not run | No install planned. [VERIFIED: research scope] |

**Packages removed due to slopcheck [SLOP] verdict:** none, because no packages are proposed. [VERIFIED: research scope]
**Packages flagged as suspicious [SUS]:** none, because no packages are proposed. [VERIFIED: research scope]

## Architecture Patterns

### System Architecture Diagram

```text
log.trace.ingested events
        |
        v
ReadOptimisedAggregator
  - validate payload shape
  - coalesce by traceId
        |
        v
TraceReadModelMaterializer.materializeTrace({ userId, traceId })
        |
        +--> ILogReadRepo.loadCheckpoint(userId, traceId)
        |
        +--> raw-after-checkpoint repo method
        |      node events: order by (eventTime, id, eventType)
        |      edge events: order by (eventTime, id, eventType)
        |
        +--> ILogReadRepo.loadLatestReadModel(userId, traceId)
        |
        v
Fold lifecycle rows into latest maps
  - node starts / node ends
  - edge starts / edge ends
  - named diagnostics
        |
        v
Build explicit-edge graph
  - topological order where possible
  - deterministic fallback for cycles/malformed input
        |
        v
Build ReadNode[], ReadEdge[], ReadTraceSummary, next checkpoint
        |
        v
ILogReadRepo.saveReadModel(...)
        |
        v
ILogReadRepo.saveCheckpoint(...)
```

This flow keeps ClickHouse access inside repositories and keeps materialization business logic outside the worker. [VERIFIED: hono-server/src/code-base.md] [VERIFIED: .planning/REQUIREMENTS.md]

### Recommended Project Structure

```text
hono-server/src/services/log/internal/
├── materialization/
│   ├── TraceReadModelMaterializer.ts      # checkpointed materialization orchestration
│   ├── TraceReadModelMaterializer.test.ts # fake repo behavioral tests
│   ├── flowOrder.ts                       # deterministic edge-aware ordering helper
│   ├── flowOrder.test.ts                  # branch/disconnected/cycle cases
│   └── types.ts                           # materializer-private raw batch/fold types
├── repo/
│   ├── ILogReadRepo.ts                    # existing contract, extend only if chosen
│   ├── types.ts                           # raw/read row shapes
│   └── impl/
│       └── LogReadRepoClickHouse.ts       # loadCheckpoint/loadLatest/raw reads
└── worker/
    └── ReadOptimisedAggregator.ts         # delegate only
```

The exact materializer name is planner discretion, but it should live under the log service internal implementation surface. [VERIFIED: hono-server/src/code-base.md] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

### Pattern 1: Worker Delegation

**What:** `ReadOptimisedAggregator` should accept or create a materializer dependency and call it from `rebuildTrace`. [VERIFIED: hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts]

**When to use:** Use this for MAT-01 so event-bus concerns stay separate from trace folding. [VERIFIED: .planning/REQUIREMENTS.md]

**Example:**

```typescript
// Source: local pattern from ReadOptimisedAggregator and code-base.md
export class ReadOptimisedAggregator {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly materializer: TraceReadModelMaterializer,
  ) {}

  private async rebuildTrace(data: TraceIngestedPayload): Promise<void> {
    await this.materializer.materializeTrace(data);
  }
}
```

### Pattern 2: Deterministic Raw Bookmarks

**What:** Compare raw rows using the checkpoint tuple `(eventTime, id, eventType)` and select only rows greater than the stored tuple for each raw stream. [VERIFIED: hono-server/src/services/log/api/types.ts] [VERIFIED: hono-server/src/services/log/internal/repo/types.ts]

**When to use:** Use this when implementing node and edge raw reads after checkpoint. [VERIFIED: .planning/REQUIREMENTS.md]

**Example:**

```sql
-- Source: existing checkpoint shape + ClickHouse client parameter pattern.
SELECT
  id,
  user_id,
  trace_id,
  event_type,
  started_at_ms,
  ended_at_ms,
  node_type,
  data,
  message,
  importance_level
FROM node_events
WHERE user_id = {userId:String}
  AND trace_id = {traceId:String}
  AND tuple(
    if(event_type = 0, assumeNotNull(started_at_ms), assumeNotNull(ended_at_ms)),
    id,
    event_type
  ) > tuple({lastTime:UInt64}, {lastId:String}, {lastEventType:UInt8})
ORDER BY
  if(event_type = 0, assumeNotNull(started_at_ms), assumeNotNull(ended_at_ms)),
  id,
  event_type
```

The current raw DDL does not sort by lifecycle timestamp, so this query is deterministic but not index-order optimized by the table key. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [CITED: https://clickhouse.com/docs/sql-reference/statements/select/order-by]

### Pattern 3: Grouped Latest-State Loads

**What:** Load latest replacement rows by grouping on logical keys and selecting fields at the greatest `materialized_at_ms`, using tuple tie breakers when needed. [VERIFIED: docs/BACKEND_SCHEMA_AND_QUERIES.md] [CITED: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax]

**When to use:** Use this for `loadLatestReadModel` and `loadCheckpoint`. [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts]

**Example:**

```sql
-- Source: docs/BACKEND_SCHEMA_AND_QUERIES.md + ClickHouse argMax docs.
SELECT
  id,
  argMax(node_type, materialized_at_ms) AS node_type,
  argMax(data, materialized_at_ms) AS data,
  argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
  argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
  argMax(importance_level, materialized_at_ms) AS importance_level,
  argMax(flow_order, materialized_at_ms) AS flow_order,
  max(materialized_at_ms) AS materialized_at_ms
FROM read_nodes
WHERE user_id = {userId:String}
  AND trace_id = {traceId:String}
GROUP BY id
```

If two replacement rows share the same `materialized_at_ms`, `argMax` may choose nondeterministically, so the planner should either make materialization timestamps unique per trace attempt or use a tuple value such as `(materialized_at_ms, id)` where appropriate. [CITED: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax]

### Pattern 4: Checkpoint-Last Save Order

**What:** Save read nodes, read edges, and summary first; save checkpoint only after those writes succeed. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

**When to use:** Use this in `TraceReadModelMaterializer.materializeTrace`. [VERIFIED: .planning/REQUIREMENTS.md]

**Example:**

```typescript
// Source: Phase 3 D-13 through D-15 and existing ILogReadRepo contract.
await this.readRepo.saveReadModel({
  userId,
  traceId,
  nodes,
  edges,
  summary,
  materializedAt,
});

await this.readRepo.saveCheckpoint({
  checkpoint: nextCheckpoint,
});
```

### Anti-Patterns to Avoid

- **Direct ClickHouse access in worker/materializer:** Services and workers must use repository contracts; ClickHouse clients belong in repository implementations. [VERIFIED: hono-server/src/code-base.md]
- **Inferring graph links from node ids or start order:** Edges are the only graph links. [VERIFIED: AGENTS.md] [VERIFIED: docs/TRACE_DESIGN.md]
- **Advancing checkpoint before read writes:** This can hide raw events that never made it into read rows. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
- **Relying on `ReplacingMergeTree` background merges for correctness:** ClickHouse docs state duplicate removal happens during background merges at unknown times and does not guarantee no duplicates at query time. [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree]
- **Blocking a trace on malformed graph data:** Phase 3 locks diagnose-and-continue semantics. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
- **Adding projection/window/ghost methods:** Phase 4 and Phase 5 own bounded projection and ghost behavior. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ClickHouse wire protocol | Custom fetch/sql HTTP wrapper | Existing `@clickhouse/client-web` repository client | Current infra already initializes the official client, and official docs cover `insert` and `query` with `JSONEachRow`. [VERIFIED: hono-server/src/infra/db/clickhouse/clickhouse.ts] [CITED: https://clickhouse.com/docs/integrations/javascript] |
| Latest replacement-row dedupe | Manual delete/update workflow | Grouped latest-version reads over `ReplacingMergeTree` rows | Existing schema is append-friendly replacement rows; ClickHouse docs warn background merge dedupe is eventual. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree] |
| Event-bus broker semantics | Durable broker or retry layer | Existing `IEventBus` plus idempotent materializer | Production bus durability is deferred; Phase 3 only needs idempotent handling of duplicate deliveries. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: hono-server/src/infra/event-bus/api/IEventBus.ts] |
| Graph projection and ghost ranges | Custom projection in materializer | Persist stable `flowOrder`; leave projection to later phases | Phase 3 owns materialized latest state, not visible-window projection. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |

**Key insight:** Phase 3 should hand-write the domain fold because it is project-specific, but it should not hand-roll database clients, broker infrastructure, or projection systems. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

## Common Pitfalls

### Pitfall 1: `scope` Column Mismatch

**What goes wrong:** `read_nodes` DDL includes `scope String`, but `ReadNodeRow`, `ReadNode`, and `LogReadRepoClickHouse.buildReadNodeRows` do not include or insert `scope`. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [VERIFIED: hono-server/src/services/log/internal/repo/types.ts] [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts]

**Why it happens:** Phase 2 tests asserted mapped field subsets with `toMatchObject`, so an omitted non-null DDL column can survive fake-client tests. [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts]

**How to avoid:** Add a Wave 0 schema/type/mapper alignment task before materializer implementation, either removing `scope` from DDL or adding it consistently to public/internal types and mapper output. [VERIFIED: codebase grep]

**Warning signs:** Fake-client tests pass but real ClickHouse insert fails for missing non-default column. [ASSUMED]

### Pitfall 2: Non-Unique `materialized_at_ms`

**What goes wrong:** Two replacement rows for the same logical key can share a version timestamp, causing ambiguous latest reads. [CITED: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax]

**Why it happens:** `Date.now()` can repeat within the same millisecond for retries or multiple writes. [ASSUMED]

**How to avoid:** Use one stable `materializedAt` per materialization attempt and ensure tests cover retry rows; consider tuple tie breakers in latest reads if equal versions are possible. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] [CITED: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax]

**Warning signs:** Duplicate retry rows produce nondeterministic `argMax` field selection. [CITED: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax]

### Pitfall 3: Treating Checkpoint Timestamp As Enough

**What goes wrong:** Events sharing the same timestamp can be skipped or reprocessed incorrectly if checkpoint comparison ignores id and event type. [VERIFIED: .planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md]

**Why it happens:** Raw lifecycle fields are timestamp-based and the checkpoint fields were deliberately expanded with id and event-type tie breakers. [VERIFIED: hono-server/src/services/log/api/types.ts]

**How to avoid:** Use tuple comparison and order on event time, id, and event type for both raw streams. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

**Warning signs:** Tests with equal timestamps pass only when event ids happen to sort in insertion order. [ASSUMED]

### Pitfall 4: Sorting By Lifecycle Time But Assuming Raw Table Index Support

**What goes wrong:** Raw-after-checkpoint queries ordered by lifecycle time will not align with current raw table `ORDER BY (user_id, trace_id, id, event_type)`. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts]

**Why it happens:** Phase 1 raw tables were keyed for identity/event type, while Phase 2 checkpoints bookmark lifecycle time/id/type. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [VERIFIED: hono-server/src/services/log/api/types.ts]

**How to avoid:** Keep Phase 3 query deterministic and trace-scoped; document that a future performance phase may need raw table sort-key or materialized source stream changes if traces grow too large for trace-local sorting. [CITED: https://clickhouse.com/docs/sql-reference/statements/select/order-by] [ASSUMED]

**Warning signs:** Materialization tests pass with fake rows, but live large-trace materialization spends time sorting raw rows. [ASSUMED]

### Pitfall 5: Inline Topological Logic With No Malformed Fallback

**What goes wrong:** A cycle or orphan edge can make the whole trace fail or produce unstable `flowOrder`. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

**Why it happens:** Topological ordering only works cleanly for acyclic graphs with known endpoints. [ASSUMED]

**How to avoid:** Separate a `flowOrder` helper with explicit tests for branches, disconnected nodes, self-edges/cycles, and orphan edges. [VERIFIED: .planning/REQUIREMENTS.md]

**Warning signs:** The algorithm returns no order when one cycle exists, or it uses raw node id order before edge constraints. [ASSUMED]

## Code Examples

Verified patterns from official and local sources:

### ClickHouse JSONEachRow Query

```typescript
// Source: https://clickhouse.com/docs/integrations/javascript
const resultSet = await client.query({
  query: "SELECT * FROM read_nodes WHERE user_id = {userId:String}",
  format: "JSONEachRow",
  query_params: {
    userId,
  },
});
const rows = await resultSet.json<ReadNodeRow[]>();
```

The official ClickHouse JS docs show `query` returning a result set consumed with `.json()` for `JSONEachRow`; current code already uses `insert` with `JSONEachRow`. [CITED: https://clickhouse.com/docs/integrations/javascript] [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts]

### Materializer Contract Shape

```typescript
// Source: local Hono service/repository boundary pattern.
export class TraceReadModelMaterializer {
  constructor(
    private readonly readRepo: ILogReadRepo,
    parentLogger: Logger<unknown>,
  ) {
    this.logger = parentLogger.getSubLogger({
      name: "TraceReadModelMaterializer",
    });
  }

  async materializeTrace(params: {
    userId: string;
    traceId: string;
  }): Promise<void> {
    const checkpoint = await this.readRepo.loadCheckpoint(params);
    const latest = await this.readRepo.loadLatestReadModel(params);
    // Load raw rows after checkpoint through a repo contract, then fold.
    void checkpoint;
    void latest;
  }
}
```

The exact raw-read method name is planner discretion, but direct ClickHouse access must stay out of the materializer. [VERIFIED: hono-server/src/code-base.md] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]

### Diagnostic Summary Construction

```typescript
// Source: existing ReadTraceSummary diagnostic fields.
const summary: ReadTraceSummary = {
  userId,
  traceId,
  nodeCount: nodes.length,
  edgeCount: edges.length,
  minImportanceLevel,
  maxImportanceLevel,
  startedAt,
  endedAt,
  materializedAt,
  diagMissingStarts,
  diagMissingEnds,
  diagNegativeDurations,
  diagCycles,
  diagOrphanEdges,
  diagInvalidImportance,
  diagClockSkew,
};
```

These fields already exist in public API types and map to ClickHouse trace summary columns. [VERIFIED: hono-server/src/services/log/api/types.ts] [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rebuild entire trace from all raw rows on every ingest | Read checkpoint, load only later raw rows, merge into latest read state | Locked for Phase 3 on 2026-06-05 | Planner should include incremental fold tests, not full replay tests only. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| Inferring progress from latest read rows | Explicit checkpoint rows separate from read-node/read-edge state | Phase 2 completed 2026-06-05 | Planner must implement `loadCheckpoint` and `saveCheckpoint` as first-class repository behavior. [VERIFIED: .planning/STATE.md] [VERIFIED: hono-server/src/services/log/api/types.ts] |
| Relying on ClickHouse background replacement for latest reads | Grouped latest-version queries such as `argMax(..., materialized_at_ms)` | Project docs before this phase | Planner must test query construction or fake returned latest rows; do not rely on `FINAL` for normal loads. [VERIFIED: docs/TRACE_DESIGN.md] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree] |

**Deprecated/outdated:**
- Inline materialization inside `ReadOptimisedAggregator` is outdated for this phase because MAT-01 requires delegation. [VERIFIED: .planning/REQUIREMENTS.md]
- `loadCheckpoint` and `loadLatestReadModel` throwing placeholders are outdated once Phase 3 starts. [VERIFIED: hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts]
- `carno.js` materializer patterns can inform concepts but must not be edited or used as the implementation target. [VERIFIED: AGENTS.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A fake-client insert test can pass while real ClickHouse rejects missing non-null columns. | Common Pitfalls | Planner may underestimate the `scope` mismatch until live insertion. |
| A2 | `Date.now()` can repeat within one millisecond for retries or multiple writes. | Common Pitfalls | Latest-row grouping may be nondeterministic when versions tie. |
| A3 | Future very-large traces may expose performance limits from sorting raw rows by lifecycle time when raw table order differs. | Common Pitfalls | Planner may need to add a documented performance caveat or schema follow-up. |
| A4 | Topological ordering only works cleanly for acyclic graphs with known endpoints. | Common Pitfalls | Flow-order fallback requirements may be under-tested. |

## Open Questions

1. **Should raw-after-checkpoint reads live on `ILogReadRepo` or a separate materialization source repo?**
   - What we know: The user allowed either contract shape, and Hono rules require repository contracts for persistence access. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] [VERIFIED: hono-server/src/code-base.md]
   - What's unclear: Whether the planner wants one broader `ILogReadRepo` or a narrower companion contract for raw source rows. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
   - Recommendation: Prefer a companion `ILogMaterializationRepo` only if it improves test clarity; otherwise extend `ILogReadRepo` because Phase 2 explicitly made it the materialization boundary. [VERIFIED: .planning/phases/02-read-schema-and-repository-contracts/02-CONTEXT.md]

2. **How should the `read_nodes.scope` DDL mismatch be resolved?**
   - What we know: DDL includes `scope`, but types and mapper omit it. [VERIFIED: hono-server/src/infra/db/clickhouse/schema.ts] [VERIFIED: hono-server/src/services/log/internal/repo/types.ts]
   - What's unclear: Whether `scope` is desired product data or an accidental leftover. [ASSUMED]
   - Recommendation: Add a Wave 0 alignment task and remove `scope` unless the planner can identify a current Hono API source for it. [VERIFIED: hono-server/src/services/log/api/types.ts]

3. **What exact invalid importance range should Phase 3 enforce?**
   - What we know: Project docs describe semantic importance values `0` through `4`, lower means more important. [VERIFIED: docs/TRACE_DESIGN.md]
   - What's unclear: Whether Hono should clamp, preserve, or diagnose values outside `0..4`. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md]
   - Recommendation: Preserve the raw value only if a valid read node can still be written; otherwise default to a safe high/noise value and increment `diagInvalidImportance`. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | npm metadata checks and local tooling | yes | 25.6.1 | Bun for tests. [VERIFIED: local tool probe] |
| Bun | Hono tests and scripts | yes | 1.3.5 | None for Bun-specific tests. [VERIFIED: local tool probe] |
| npm | Registry version verification | yes | 11.9.0 | Existing lockfiles if offline. [VERIFIED: local tool probe] |
| Fallow | Hono source audit | yes through `hono-server/node_modules` | 2.88.1 | `bun run fallow` from `hono-server`. [VERIFIED: local tool probe] |
| Wrangler | Worker dev runtime | yes | 4.97.0 local | Not required for Phase 3 unit tests. [VERIFIED: local tool probe] |
| ClickHouse localhost | Optional live integration smoke | yes | `/ping` returned `Ok.` | Fake-client tests for planning; live check can be optional. [VERIFIED: local tool probe] |
| Docker | Optional local ClickHouse management | yes | installed, exact version not captured | Existing localhost ClickHouse. [VERIFIED: local tool probe] |
| Context7 CLI | Documentation lookup | no | — | Official docs via WebSearch/WebFetch. [VERIFIED: local tool probe] |

**Missing dependencies with no fallback:**
- None for planning and unit-test implementation. [VERIFIED: local tool probe]

**Missing dependencies with fallback:**
- Context7 CLI is missing; official ClickHouse and Bun docs were fetched directly. [VERIFIED: local tool probe] [CITED: https://clickhouse.com/docs/integrations/javascript] [CITED: https://bun.com/docs/test]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test runner, Bun 1.3.5 available. [VERIFIED: local tool probe] [CITED: https://bun.com/docs/test] |
| Config file | none detected under `hono-server`; tests live beside source files. [VERIFIED: codebase grep] |
| Quick run command | `cd hono-server && bun test src/services/log/internal/materialization` [VERIFIED: Bun docs support file/path filters] |
| Full suite command | `cd hono-server && bun test && bun --bun x tsc --noEmit --project tsconfig.json && bun run fallow` [VERIFIED: existing package/tooling] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MAT-01 | Aggregator delegates trace work to materializer | unit | `cd hono-server && bun test src/services/log/internal/worker/ReadOptimisedAggregator.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-02 | Materializer loads checkpoint before raw reads | unit | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-03 | Raw rows after checkpoint use deterministic tuple ordering | unit/fake repo | `cd hono-server && bun test src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | Existing file, needs new tests. [VERIFIED: codebase grep] |
| MAT-04 | New raw events merge into existing latest state | unit | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-05 | Stable explicit-edge `flowOrder` for branches, disconnected nodes, cycles | unit | `cd hono-server && bun test src/services/log/internal/materialization/flowOrder.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-06 | Read rows written through `ILogReadRepo` only | unit/source assertion | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-07 | Checkpoint saved only after read model save succeeds | unit | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-08 | Duplicate delivery is idempotent and checkpoint does not regress | unit | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |
| MAT-09 | Malformed graph data increments named diagnostics and continues | unit | `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Missing - Wave 0/phase task. [VERIFIED: codebase grep] |

### Sampling Rate

- **Per task commit:** `cd hono-server && bun test <changed-test-file>` plus `bun --bun x tsc --noEmit --project tsconfig.json` when types changed. [VERIFIED: Bun docs] [VERIFIED: hono-server/tsconfig.json]
- **Per wave merge:** `cd hono-server && bun test && bun run fallow`. [VERIFIED: hono-server/package.json]
- **Phase gate:** `cd hono-server && bun test && bun --bun x tsc --noEmit --project tsconfig.json && bun run fallow`. [VERIFIED: existing tooling]

### Wave 0 Gaps

- [ ] `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` - covers MAT-02, MAT-04, MAT-06, MAT-07, MAT-08, MAT-09. [VERIFIED: missing by codebase grep]
- [ ] `hono-server/src/services/log/internal/materialization/flowOrder.test.ts` - covers MAT-05 branch/disconnected/cycle/orphan ordering. [VERIFIED: missing by codebase grep]
- [ ] `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts` - covers MAT-01 delegation and trace coalescing integration. [VERIFIED: missing by codebase grep]
- [ ] `LogReadRepoClickHouse.test.ts` query tests - cover `loadCheckpoint`, `loadLatestReadModel`, and raw-after-checkpoint query construction. [VERIFIED: existing file needs new tests]
- [ ] Schema/type/mapper alignment test for `read_nodes.scope` mismatch. [VERIFIED: schema/type grep]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase 3 does not add routes or auth decisions; user ownership arrives as `userId` in event payloads and repo calls. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| V3 Session Management | no | No session or cookie behavior in phase scope. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| V4 Access Control | yes | Keep all checkpoint/read/raw queries scoped by `userId` and `traceId`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] |
| V5 Input Validation | yes | Materializer must validate unknown event payloads in worker and diagnose malformed raw graph data instead of throwing whole-trace failures. [VERIFIED: hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts] [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| V6 Cryptography | no | No cryptographic functionality in phase scope. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |

### Known Threat Patterns for Hono Materialization

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user trace mixing | Information Disclosure | Every repository method must filter/write by `userId` plus `traceId`; tests should assert both are passed. [VERIFIED: hono-server/src/services/log/internal/repo/ILogReadRepo.ts] |
| Checkpoint regression or premature checkpoint | Tampering | Compare next checkpoint to prior checkpoint and save checkpoint only after read rows/summary succeed. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |
| Log payload leakage | Information Disclosure | Log only safe ids/counts/durations; do not log raw node/edge payload data. [VERIFIED: hono-server/src/code-base.md] |
| Malformed graph denial of materialization | Denial of Service | Diagnose and continue for malformed graph data; avoid throwing whole trace on orphan/cycle/missing lifecycle. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/03-checkpointed-materialization/03-CONTEXT.md` - locked decisions, scope, diagnostics, checkpoint-last semantics.
- `.planning/REQUIREMENTS.md` - MAT-01 through MAT-09 and safety requirements.
- `.planning/STATE.md` - Phase 2 complete and Phase 3 current.
- `AGENTS.md` - Hono-only scope and project constraints.
- `hono-server/src/code-base.md` - Hono architecture, repository boundaries, event bus rules, Fallow gate.
- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` - current worker scaffold.
- `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` - current read repository contract.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` - current ClickHouse read repo placeholders and save mappings.
- `hono-server/src/services/log/internal/repo/types.ts` - raw and read row shapes.
- `hono-server/src/services/log/api/types.ts` - public read-model/checkpoint/diagnostic types.
- `hono-server/src/infra/db/clickhouse/schema.ts` - raw/read/checkpoint DDL.
- `docs/TRACE_DESIGN.md` - explicit edge graph and flow-order materializer concepts.
- `docs/BACKEND_SCHEMA_AND_QUERIES.md` - grouped latest-row query pattern.
- ClickHouse JS docs - `JSONEachRow` insert/query and web result-set behavior. [CITED: https://clickhouse.com/docs/integrations/javascript]
- ClickHouse ReplacingMergeTree docs - versioned replacement semantics and eventual dedupe caveat. [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree]
- ClickHouse argMax docs - maximum-value argument selection and nondeterministic ties. [CITED: https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax]
- Bun test docs - TypeScript test discovery and CLI filtering. [CITED: https://bun.com/docs/test]

### Secondary (MEDIUM confidence)

- npm registry metadata for existing packages checked on 2026-06-05. [VERIFIED: npm registry]
- Local environment probes for Node, Bun, npm, Wrangler, Fallow, ClickHouse `/ping`, and Context7 availability. [VERIFIED: local tool probe]

### Tertiary (LOW confidence)

- Assumptions listed in the Assumptions Log only. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing package metadata, local installs, and npm registry were checked; no new packages are proposed. [VERIFIED: npm registry]
- Architecture: HIGH - phase decisions and Hono codebase guide give explicit boundaries, and current files match the intended repository/worker structure. [VERIFIED: .planning/phases/03-checkpointed-materialization/03-CONTEXT.md] [VERIFIED: hono-server/src/code-base.md]
- Pitfalls: HIGH for schema/type mismatch and ClickHouse replacement semantics; MEDIUM for performance caveats around raw sort order because no live large-trace benchmark was run. [VERIFIED: codebase grep] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree] [ASSUMED]

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 for codebase-specific findings; re-check npm registry and ClickHouse docs if implementation starts after that date. [ASSUMED]

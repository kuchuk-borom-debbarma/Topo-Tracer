# Phase 03: Checkpointed Materialization - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 15
**Analogs found:** 13 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` | service | event-driven + batch transform + CRUD | `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` + `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` | role-match |
| `hono-server/src/services/log/internal/materialization/types.ts` | model | transform | `hono-server/src/services/log/internal/repo/types.ts` | role-match |
| `hono-server/src/services/log/internal/materialization/flowOrder.ts` | utility | transform | `docs/TRACE_DESIGN.md` + `hono-server/src/services/log/api/types.ts` | partial |
| `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | test | event-driven + CRUD | `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` | role-match |
| `hono-server/src/services/log/internal/materialization/flowOrder.test.ts` | test | transform | `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` | partial |
| `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` | worker | event-driven | `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` | exact |
| `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts` | test | event-driven | `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` | role-match |
| `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` | repository contract | CRUD + batch | `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` | exact |
| `hono-server/src/services/log/internal/repo/types.ts` | model | file-I/O + transform | `hono-server/src/services/log/internal/repo/types.ts` | exact |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | repository implementation | CRUD + file-I/O | `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | exact |
| `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | test | CRUD + file-I/O | `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` | exact |
| `hono-server/src/services/log/internal/repo/index.ts` | provider | request-response wiring | `hono-server/src/services/log/internal/repo/index.ts` | exact |
| `hono-server/src/infra/db/clickhouse/schema.ts` | config | file-I/O | `hono-server/src/infra/db/clickhouse/schema.ts` | exact |
| `hono-server/src/infra/db/clickhouse/schema.test.ts` | test | source assertion | `hono-server/src/services/log/internal/repo/ILogReadRepo.test.ts` | role-match |
| `.planning/phases/03-checkpointed-materialization/03-TECHNICAL.md` | documentation | transform | `docs/TRACE_FLOW_CODE_LEVEL.md` | role-match |

## Pattern Assignments

### `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` (service, event-driven + batch transform + CRUD)

**Analog:** `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`, `hono-server/src/services/log/internal/repo/ILogReadRepo.ts`

**Imports/dependency pattern** (LogServiceImpl lines 1-12):
```typescript
import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { ILogService } from "../../api/ILogService";
import {
  IngestEdgeStart,
  IngestNodeStart,
  IngestNodeEnd,
  IngestEdgeEnd,
} from "../../api/types";
import { createLogWriteRepo } from "../repo";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";
```

Copy the dependency style, but depend on `ILogReadRepo` and materializer-private types. Do not import ClickHouse clients in this file.

**Constructor/logger pattern** (LogServiceImpl lines 13-26):
```typescript
export class LogServiceImpl extends ILogService {
  readonly logger: Logger<unknown>;
  readonly writeRepo: ILogWriteRepo;
  readonly eventBus: IEventBus;
  constructor(
    logger: Logger<unknown>,
    eventBus: IEventBus,
    writeRepo?: ILogWriteRepo,
  ) {
    super();
    this.logger = logger.getSubLogger({ name: "LogServiceImpl" });
    this.eventBus = eventBus;
    this.writeRepo = writeRepo ?? createLogWriteRepo(this.logger);
  }
```

Use this for `TraceReadModelMaterializer`: accept `parentLogger`, accept repo dependencies by contract, and create `getSubLogger({ name: "TraceReadModelMaterializer" })`.

**Orchestration/error pattern** (LogServiceImpl lines 42-79):
```typescript
try {
  this.validateEdgeStarts(data.edgeStarts);
  // Service owns orchestration; persistence stays behind the repo contract.
  await this.writeRepo.ingestNodesNEdges(data);

  const traceIds = this.getTraceIds(data);
  if (traceIds.length === 0) {
    return;
  }

  await this.eventBus.publish(/* ... */);
} catch (err) {
  this.logger.error(err);
  throw err;
}
```

Use the same structure for checkpointed materialization: validate/fold in the service, call repository contracts, log caught failures, rethrow. The required write order is `saveReadModel(...)` first, then `saveCheckpoint(...)`.

**Repository boundary pattern** (ILogReadRepo lines 3-30):
```typescript
export abstract class ILogReadRepo {
  abstract loadCheckpoint(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null>;

  abstract loadLatestReadModel(params: {
    userId: string;
    traceId: string;
  }): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }>;

  abstract saveReadModel(params: {
    userId: string;
    traceId: string;
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary;
    materializedAt: number;
  }): Promise<void>;

  abstract saveCheckpoint(params: {
    checkpoint: ReadCheckpoint;
  }): Promise<void>;
}
```

Planner should add raw-after-checkpoint reads behind a repository contract here or a companion materialization repo. The materializer must not read ClickHouse directly.

---

### `hono-server/src/services/log/internal/materialization/types.ts` (model, transform)

**Analog:** `hono-server/src/services/log/internal/repo/types.ts`

**Raw row pattern** (lines 1-25):
```typescript
export type NodeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  node_type: string | null;
  data: Record<string, string>;
  message: string | null;
  importance_level: number | null;
};
```

Use explicit private types for fold state, bookmarks, and diagnostics. Keep snake_case row types in repo files; materializer-local state should use camelCase.

**Read row/checkpoint shape** (repo types lines 27-90):
```typescript
export type ReadNodeRow = {
  id: string;
  user_id: string;
  trace_id: string;
  node_type: string;
  data: Record<string, string>;
  started_at_ms: number;
  ended_at_ms: number | null;
  start_message: string | null;
  end_message: string | null;
  importance_level: number;
  flow_order: number;
  materialized_at_ms: number;
};
```

Keep materializer types private unless they are needed by `ILogReadRepo`.

---

### `hono-server/src/services/log/internal/materialization/flowOrder.ts` (utility, transform)

**Analog:** `docs/TRACE_DESIGN.md`, `hono-server/src/services/log/api/types.ts`

**Graph invariant source** (TRACE_DESIGN lines 3-11):
```markdown
- Nodes are work.
- Edges are the only links between nodes.
- Nodes do not have `parentId`, ancestry, span containment, or structural links.
```

**Materialized fields to update** (api/types lines 32-59):
```typescript
export type ReadNode = {
  id: string;
  userId: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startedAt: number;
  endedAt: number | null;
  startMessage: string | null;
  endMessage: string | null;
  importanceLevel: number;
  flowOrder: number;
  materializedAt: number;
};
```

**Ordering rule source** (TRACE_DESIGN lines 88-103):
```markdown
Materializer computes:

- lifecycle status and duration
- causal `flowOrder` from explicit edges
- trace summary counts
- monotonic `materializedAtUnixMs`
```

Implement this as a pure helper. Inputs should be latest read nodes and valid explicit read edges. Outputs should be deterministic node ids to numeric `flowOrder`, plus diagnostic increments for cycles/orphans.

---

### `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` (worker, event-driven)

**Analog:** same file

**Event-bus subscription pattern** (lines 12-23):
```typescript
async init(): Promise<void> {
  await this.eventBus.subscribe(
    {
      topic: "log.trace.ingested",
      consumerName: "read-optimised-aggregator",
      batchSize: 100,
    },
    async (events) => {
      await this.run(events);
    },
  );
}
```

Preserve this subscription shape. Add materializer dependency through constructor or default factory; do not move event bus logic into materializer.

**Coalescing pattern** (lines 25-43):
```typescript
async run(events: EventBusPublishedEvent[]): Promise<void> {
  const traces = new Map<string, TraceIngestedPayload>();

  for (const event of events) {
    if (!this.isTraceIngestedPayload(event.data)) {
      continue;
    }

    // Multiple ingest events can point to the same trace. Keeping the last
    // event per trace lets one listener batch trigger one rebuild per trace.
    traces.set(event.data.traceId, event.data);
  }

  for (const trace of traces.values()) {
    await this.rebuildTrace(trace);
  }
}
```

Keep the coalescing behavior and replace the stubbed `rebuildTrace` with delegation to `materializer.materializeTrace({ userId, traceId })`.

**Unknown payload guard** (lines 46-65):
```typescript
private isTraceIngestedPayload(data: unknown): data is TraceIngestedPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const payload = data as {
    userId?: unknown;
    traceId?: unknown;
  };

  const hasUserId = typeof payload.userId === "string";
  const hasTraceId = typeof payload.traceId === "string";

  return hasUserId && hasTraceId;
}
```

Reuse this testable guard style for worker tests.

---

### `hono-server/src/services/log/internal/repo/ILogReadRepo.ts` (repository contract, CRUD + batch)

**Analog:** same file

**Contract shape** (lines 1-30):
```typescript
import { ReadCheckpoint, ReadNode, ReadEdge, ReadTraceSummary } from "../../api/types";

export abstract class ILogReadRepo {
  abstract loadCheckpoint(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null>;
  // ...
}
```

If extending this file, use object parameters and explicit `Promise` returns. Do not add projection-facing names (`threshold`, `visible`, `window`, `ghost`, `projected`) in Phase 3.

---

### `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` (repository implementation, CRUD + file-I/O)

**Analog:** same file and `LogWriteRepoClickHouse.ts`

**Imports and injected client provider** (LogReadRepoClickHouse lines 1-27):
```typescript
import { Logger } from "tslog";
import type { ClickHouseClient } from "@clickhouse/client-web";
import {
  CLICKHOUSE_READ_NODES_TABLE,
  CLICKHOUSE_READ_EDGES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
  getInitializedClickHouseClient,
} from "../../../../../infra/db/clickhouse";
import { ReadCheckpoint, ReadNode, ReadEdge, ReadTraceSummary } from "../../../api/types";
import { ILogReadRepo } from "../ILogReadRepo";
import { ReadNodeRow, ReadEdgeRow, TraceSummaryRow, ReadCheckpointRow } from "../types";
```

For load methods, extend `getClient` from `Pick<ClickHouseClient, "insert">` to include `"query"`, matching fake-client tests.

**Save read rows before checkpoint** (lines 47-89 and 91-108):
```typescript
async saveReadModel(params: {
  userId: string;
  traceId: string;
  nodes: ReadNode[];
  edges: ReadEdge[];
  summary: ReadTraceSummary;
  materializedAt: number;
}): Promise<void> {
  const nodeRows = this.buildReadNodeRows(params.nodes);
  const edgeRows = this.buildReadEdgeRows(params.edges);
  const summaryRow = this.buildTraceSummaryRow(params.summary);

  const client = this.getClient();

  if (nodeRows.length > 0) {
    await client.insert({
      table: CLICKHOUSE_READ_NODES_TABLE,
      values: nodeRows,
      format: "JSONEachRow",
    });
  }

  await client.insert({
    table: CLICKHOUSE_TRACE_SUMMARIES_TABLE,
    values: [summaryRow],
    format: "JSONEachRow",
  });
}
```

Materializer should call `saveReadModel` before `saveCheckpoint`. The repository already maps checkpoint rows with exact bookmark fields.

**Mapper pattern** (lines 110-177):
```typescript
private buildReadNodeRows(nodes: ReadNode[]): ReadNodeRow[] {
  return nodes.map((node): ReadNodeRow => ({
    id: node.id,
    user_id: node.userId,
    trace_id: node.traceId,
    node_type: node.nodeType,
    data: node.data,
    started_at_ms: node.startedAt,
    ended_at_ms: node.endedAt,
    start_message: node.startMessage,
    end_message: node.endMessage,
    importance_level: node.importanceLevel,
    flow_order: node.flowOrder,
    materialized_at_ms: node.materializedAt,
  }));
}
```

Copy this camelCase-to-snake_case mapping style for new query mappers. Keep SQL/client details inside this repository.

**Raw lifecycle row source** (LogWriteRepoClickHouse lines 32-99):
```typescript
return [
  ...data.nodeStarts.map((node): NodeEventRow => ({
    id: node.id,
    user_id: data.userId,
    trace_id: node.traceId,
    event_type: 0,
    started_at_ms: node.startedAt,
    ended_at_ms: null,
    node_type: node.nodeType,
    data: node.data,
    message: node.startMessage ?? null,
    importance_level: node.importanceLevel,
  })),
  ...data.nodeEnds.map((node): NodeEventRow => ({
    id: node.id,
    user_id: data.userId,
    trace_id: node.traceId,
    event_type: 1,
    started_at_ms: null,
    ended_at_ms: node.endedAt,
    node_type: null,
    data: {},
    message: node.endMessage ?? null,
    importance_level: null,
  })),
];
```

Raw-after-checkpoint query methods must order by lifecycle event time, id, and event type for node and edge streams.

---

### `hono-server/src/services/log/internal/repo/types.ts` (model, file-I/O + transform)

**Analog:** same file

**Checkpoint row pattern** (lines 77-90):
```typescript
export type ReadCheckpointRow = {
  user_id: string;
  trace_id: string;

  node_progress_timestamp: number;
  node_progress_id: string;
  node_progress_event_type: number;

  edge_progress_timestamp: number;
  edge_progress_id: string;
  edge_progress_event_type: number;

  updated_at_ms: number;
};
```

Add any new raw batch/query result row types here, not in public API types. Keep `NodeEventRow` and `EdgeEventRow` aligned with raw table columns.

---

### `hono-server/src/infra/db/clickhouse/schema.ts` (config, file-I/O)

**Analog:** same file

**Raw table source** (lines 8-23 and 26-41):
```typescript
export const CLICKHOUSE_CREATE_NODE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_NODE_EVENTS_TABLE}
(
  id String COMMENT 'Node id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  started_at_ms Nullable(UInt64) COMMENT 'UTC start timestamp in milliseconds for start events; null for end events',
  ended_at_ms Nullable(UInt64) COMMENT 'UTC end timestamp in milliseconds for end events; null for start events',
  node_type Nullable(String) COMMENT 'Node type for start events; null for end events when not provided',
  data Map(String, String) COMMENT 'String key/value payload captured for node start events',
  message Nullable(String) COMMENT 'Start or end message associated with the event',
  importance_level Nullable(Int32) COMMENT 'Node importance level for start events'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, event_type);
`;
```

**Replacement table/checkpoint pattern** (lines 50-68 and 130-144):
```typescript
export const CLICKHOUSE_CREATE_READ_NODES_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_READ_NODES_TABLE}
(
  id String COMMENT 'Node id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  scope String COMMENT 'Contextual scope or service name for the node',
  importance_level Int32 COMMENT 'Node importance level (higher is more important)',
  flow_order Int32 COMMENT 'Deterministic execution order within the trace',
  materialized_at_ms UInt64 COMMENT 'Version field: materialization timestamp in milliseconds'
)
ENGINE = ReplacingMergeTree(materialized_at_ms)
ORDER BY (user_id, trace_id, id);
`;
```

Research found a `read_nodes.scope` mismatch: schema has `scope`, but `ReadNodeRow` and mapper do not. Planner should add an explicit schema/type/mapper alignment task before relying on live ClickHouse inserts.

---

### Test Files

Applies to:

- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts`
- `hono-server/src/services/log/internal/materialization/flowOrder.test.ts`
- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts`
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts`
- `hono-server/src/infra/db/clickhouse/schema.test.ts`

**Analog:** `LogServiceImpl.test.ts`, `LogReadRepoClickHouse.test.ts`, `ILogReadRepo.test.ts`

**Bun/fake dependency pattern** (LogServiceImpl.test lines 1-47):
```typescript
import { describe, expect, test } from "bun:test";
import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";

class FakeLogWriteRepo implements ILogWriteRepo {
  calls: IngestInput[] = [];
  nextError: Error | null = null;

  async ingestNodesNEdges(data: IngestInput): Promise<void> {
    this.calls.push(data);
    if (this.nextError) {
      throw this.nextError;
    }
  }
}
```

Use fake repositories for materializer tests. Record call order to prove checkpoint-last behavior and retry idempotency.

**Behavior assertion pattern** (LogServiceImpl.test lines 49-109):
```typescript
await expect(
  service.ingestNodesNEdges(createIngestInput([edgeStart])),
).rejects.toThrow("Edge start requires fromNodeId and toNodeId.");

expect(writeRepo.calls).toHaveLength(0);
expect(eventBus.published).toHaveLength(0);
```

Use this for malformed graph behavior: assert diagnostics increment and valid state is still written.

**Fake ClickHouse client pattern** (LogReadRepoClickHouse.test lines 11-33):
```typescript
type InsertOptions = {
  table: string;
  values: unknown[];
  format: "JSONEachRow";
};

class FakeClickHouseClient {
  inserts: InsertOptions[] = [];

  async insert(options: InsertOptions): Promise<void> {
    this.inserts.push(options);
  }
}
```

Extend with `query(options)` for `loadCheckpoint`, `loadLatestReadModel`, and raw-after-checkpoint query tests.

**Source assertion pattern** (ILogReadRepo.test lines 1-17 and 61-83):
```typescript
// We use string-based source assertions to check for contract presence and absence
// without causing compilation errors before the types are actually implemented.

test("should NOT contain projection-facing names", () => {
  const forbidden = ["threshold", "visible", "window", "ghost", "projected"];
  for (const name of forbidden) {
    expect(content.includes(name)).toBe(false);
  }
});
```

Use source assertions to prevent Phase 3 from adding projection/ghost route creep and to verify schema/type/mapper alignment for `scope`.

---

### `.planning/phases/03-checkpointed-materialization/03-TECHNICAL.md` (documentation, transform)

**Analog:** `docs/TRACE_FLOW_CODE_LEVEL.md`

**Concrete flow pattern** (lines 51-72):
````markdown
## Whole Flow

```text
SDK TraceNode
  -> BatchExporter
  -> POST /telemetry/events
  -> LogController.ingestEvents
  -> LogService.ingestEvents
  -> RawEventRepository.append
  -> ClickHouse node_trace_events
  -> EventBus.publish("trace.events.ingested")
  -> TraceReadModelWorker queue
```
````

**Materializer explanation pattern** (lines 131-145):
```markdown
## Materializer

`TraceReadModelBuilder.build()` replays raw events into:

- `ReadNode[]`
- `ReadEdge[]`
- `TraceSummary`

`flowOrder` is computed from explicit edges. Nodes with no inbound explicit edge
are ordered by start time and id.
```

Phase 3 docs should reference Hono files directly and explain checkpoint loading, raw ordering, latest-state merge, flow-order generation, diagnostics, write order, retry behavior, and worker delegation.

## Shared Patterns

### Hono Service Boundaries

**Source:** `hono-server/src/code-base.md`, `LogServiceImpl.ts`
**Apply to:** materializer, worker changes, repo contract changes

- Business folding belongs in `TraceReadModelMaterializer`, not routes or repositories.
- Persistence belongs behind `ILogReadRepo` or a companion repository contract.
- Repository implementations may import ClickHouse infra; services and workers must not.

### Safe Logging

**Source:** `LogServiceImpl.ts` lines 34-40, `LogReadRepoClickHouse.ts` lines 59-64
**Apply to:** materializer, worker, repository

```typescript
this.logger.trace("Saving read model to ClickHouse", {
  userId: params.userId,
  traceId: params.traceId,
  nodes: nodeRows.length,
  edges: edgeRows.length,
});
```

Log ids, counts, and durations only. Do not log raw node/edge payloads.

### Event Bus Semantics

**Source:** `hono-server/src/infra/event-bus/api/types.ts` lines 1-14; `LogServiceImpl.ts` lines 57-75
**Apply to:** worker delegation and duplicate delivery tests

```typescript
export type EventBusPublishEvent = {
  topic: string;
  idempotencyId: string;
  key?: string;
  data: unknown;
};
```

`traceId` is the ordering lane. Worker handlers must tolerate duplicate or batched delivery.

### ClickHouse JSONEachRow

**Source:** `LogReadRepoClickHouse.ts` lines 68-88 and `LogWriteRepoClickHouse.ts` lines 120-134
**Apply to:** read model writes, checkpoint writes, fake-client tests

```typescript
await client.insert({
  table: CLICKHOUSE_READ_NODES_TABLE,
  values: nodeRows,
  format: "JSONEachRow",
});
```

For query methods, use the same injected-client pattern and consume `JSONEachRow` result sets in the repository implementation.

### Latest Replacement Rows

**Source:** `docs/BACKEND_SCHEMA_AND_QUERIES.md` lines 99-118 and `docs/TRACE_DESIGN.md` lines 84-86
**Apply to:** `loadCheckpoint`, `loadLatestReadModel`

```sql
SELECT
  trace_id,
  id,
  argMax(name, materialized_at_ms) AS name,
  argMax(importance_level, materialized_at_ms) AS importance_level,
  argMax(flow_order, materialized_at_ms) AS flow_order,
  max(materialized_at_ms) AS latest_materialized_at_ms
FROM topo_tracer.node_read_nodes
WHERE trace_id = {traceId:String}
GROUP BY trace_id, id
```

Do not rely on `FINAL` or background `ReplacingMergeTree` merges for correctness. Use grouped latest-version reads.

### Verification Commands

**Source:** `03-VALIDATION.md` lines 20-24 and 30-33; `hono-server/package.json` lines 4-11
**Apply to:** all Phase 3 implementation

```bash
cd hono-server && bun test
cd hono-server && bun run fallow
```

Targeted command from validation:

```bash
cd hono-server && bun test src/services/log/internal/materialization/flowOrder.test.ts src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts src/services/log/internal/worker/ReadOptimisedAggregator.test.ts src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts
```

## No Analog Found

Files with no close in-scope Hono implementation analog:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `hono-server/src/services/log/internal/materialization/flowOrder.ts` | utility | transform | Hono has no existing graph ordering helper. Use `docs/TRACE_DESIGN.md` invariants and write pure tests. |
| `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` | service | event-driven + batch transform + CRUD | Hono has service/repo patterns but no existing materializer implementation. Do not copy the old `carno.js` backend into Hono; use it only as conceptual background if needed. |

## Metadata

**Analog search scope:** `hono-server/src`, `hono-server/package.json`, `docs/TRACE_DESIGN.md`, `docs/TRACE_FLOW_CODE_LEVEL.md`, `docs/BACKEND_SCHEMA_AND_QUERIES.md`, Phase 3 planning artifacts.
**Files scanned:** 24 source/doc/test files plus Phase 3 context/research/validation artifacts.
**Pattern extraction date:** 2026-06-05

# Phase 01: Edge Endpoint Raw Contract - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `hono-server/src/services/log/api/types.ts` | model / public API types | event-driven batch ingest | `hono-server/src/services/log/api/types.ts` | exact |
| `hono-server/src/services/log/api/ILogService.ts` | service contract | event-driven batch ingest | `hono-server/src/services/log/api/ILogService.ts` | exact |
| `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` | service | event-driven append-then-publish | `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` | exact |
| `hono-server/src/services/log/internal/repo/ILogWriteRepo.ts` | repository contract | batch append | `hono-server/src/services/log/internal/repo/ILogWriteRepo.ts` | exact |
| `hono-server/src/services/log/internal/repo/types.ts` | repository model | batch append row transform | `hono-server/src/services/log/internal/repo/types.ts` | exact |
| `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` | repository | batch append / file-I/O via ClickHouse | `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` | exact |
| `hono-server/src/infra/db/clickhouse/schema.ts` | config / schema | batch append storage definition | `hono-server/src/infra/db/clickhouse/schema.ts` | exact |
| `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` | test | event-driven batch validation | `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` + Bun test convention | role-match |
| `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` | test | batch append row transform | `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` + Bun test convention | role-match |

## Pattern Assignments

### `hono-server/src/services/log/api/types.ts` (model / public API types, event-driven batch ingest)

**Analog:** `hono-server/src/services/log/api/types.ts`

**Public plain type pattern** (lines 1-22):
```typescript
export type IngestNodeStart = {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startMessage?: string;
  startedAt: number; //UTC Milisecond
  importanceLevel: number;
};

export type IngestEdgeStart = {
  id: string;
  traceId: string;
  edgeType: string;
  startedAt: number; //UTC Milisecond
};
```

**Copy this pattern:** keep public input types direct and readable. Add `fromNodeId: string`, `toNodeId: string`, and `data: Record<string, string>` directly to `IngestEdgeStart`; do not hide endpoints inside `data` and do not introduce composed utility types.

**Lifecycle split target:** node/edge start inputs keep `startedAt`; node/edge end inputs keep `endedAt`. Do not add endpoint fields to `IngestEdgeEnd`.

---

### `hono-server/src/services/log/api/ILogService.ts` (service contract, event-driven batch ingest)

**Analog:** `hono-server/src/services/log/api/ILogService.ts`

**Import and object-parameter contract pattern** (lines 1-16):
```typescript
import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
} from "./types";

export abstract class ILogService {
  abstract ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;
}
```

**Copy this pattern:** service contracts use abstract classes, object parameters, explicit arrays, and type imports from the module public `api/types.ts`. This file likely needs no signature change if `IngestEdgeStart` is updated in `types.ts`.

---

### `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` (service, event-driven append-then-publish)

**Analog:** `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`

**Imports and dependency injection pattern** (lines 1-25):
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

**Logging and append-before-publish pattern** (lines 34-44):
```typescript
this.logger.trace("ingestNodesNEdges", {
  userId: data.userId,
  nodeStarts: data.nodeStarts.length,
  edgeStarts: data.edgeStarts.length,
  nodeEnds: data.nodeEnds.length,
  edgeEnds: data.edgeEnds.length,
});

try {
  // Service owns orchestration; persistence stays behind the repo contract.
  await this.writeRepo.ingestNodesNEdges(data);
```

**Event publish pattern** (lines 56-74):
```typescript
await this.eventBus.publish(
  traceIds.map((traceId) => ({
    topic: "log.trace.ingested",
    // traceId is the ordering key because read-model rebuild work for one
    // trace must observe the same order as the append-only writes.
    key: traceId,
    // The id is derived from this ingest's trace-local payload, not just
    // traceId, so retries dedupe while later ingests still produce events.
    idempotencyId: this.buildTraceIngestIdempotencyId(data, traceId),
    data: {
      userId: data.userId,
      traceId,
    },
  })),
  {
    // batchId is only for correlating this publish call in logs/brokers.
    batchId: `log.trace.ingested:${data.userId}:${traceIds.join(",")}`,
  },
);
```

**Error handling pattern** (lines 75-78):
```typescript
} catch (err) {
  this.logger.error(err);
  throw err;
}
```

**Copy this pattern:** add edge-start endpoint validation before `await this.writeRepo.ingestNodesNEdges(data)`. Keep validation in the service, keep ClickHouse out of the service, and preserve publish-after-persist. Validate only missing/blank `fromNodeId` and `toNodeId`; do not query node existence and do allow self-edges.

**Suggested helper shape to match local style:**
```typescript
private validateEdgeStarts(edgeStarts: IngestEdgeStart[]): void {
  for (const edge of edgeStarts) {
    if (edge.fromNodeId.trim() === "" || edge.toNodeId.trim() === "") {
      throw new Error("Edge start requires fromNodeId and toNodeId.");
    }
  }
}
```

---

### `hono-server/src/services/log/internal/repo/ILogWriteRepo.ts` (repository contract, batch append)

**Analog:** `hono-server/src/services/log/internal/repo/ILogWriteRepo.ts`

**Repository contract pattern** (lines 1-16):
```typescript
import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
} from "../../api/types";

export abstract class ILogWriteRepo {
  abstract ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;
}
```

**Copy this pattern:** repository contracts describe persistence behavior needed by the service and use public ingest types. This file likely needs no signature change if `IngestEdgeStart` changes in `api/types.ts`.

---

### `hono-server/src/services/log/internal/repo/types.ts` (repository model, batch append row transform)

**Analog:** `hono-server/src/services/log/internal/repo/types.ts`

**Repo-private row type pattern** (lines 1-20):
```typescript
export type NodeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  timestamp_ms: number;
  node_type: string | null;
  data: Record<string, string>;
  message: string | null;
  importance_level: number | null;
};

export type EdgeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  timestamp_ms: number;
  edge_type: string | null;
};
```

**Copy this pattern:** keep ClickHouse row shapes repo-private and snake_case. Replace `timestamp_ms` with `started_at_ms: number | null` and `ended_at_ms: number | null` on both raw row types. Add `from_node_id`, `to_node_id`, and `data` to `EdgeEventRow`; keep endpoint columns nullable if end rows do not carry start-only endpoint metadata.

---

### `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` (repository, batch append / ClickHouse)

**Analog:** `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts`

**Imports and logger pattern** (lines 1-24):
```typescript
import { Logger } from "tslog";
import {
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
  getInitializedClickHouseClient,
} from "../../../../../infra/db/clickhouse";
import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
} from "../../../api/types";
import { ILogWriteRepo } from "../ILogWriteRepo";
import { EdgeEventRow, NodeEventRow } from "../types";

export class LogWriteRepoClickHouse extends ILogWriteRepo {
  readonly logger: Logger<unknown>;

  constructor(parentLogger: Logger<unknown>) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "LogWriteRepoClickHouse",
    });
  }
```

**Node row mapping pattern** (lines 31-55):
```typescript
return [
  // Start events carry node metadata captured when the node begins.
  ...data.nodeStarts.map((node): NodeEventRow => ({
    id: node.id,
    user_id: data.userId,
    trace_id: node.traceId,
    event_type: 0,
    timestamp_ms: node.startedAt,
    node_type: node.nodeType,
    data: node.data,
    message: node.startMessage ?? null,
    importance_level: node.importanceLevel,
  })),
  // End events only carry completion data; start-only columns stay empty.
  ...data.nodeEnds.map((node): NodeEventRow => ({
    id: node.id,
    user_id: data.userId,
    trace_id: node.traceId,
    event_type: 1,
    timestamp_ms: node.endedAt,
    node_type: null,
    data: {},
    message: node.endMessage ?? null,
    importance_level: null,
  })),
];
```

**Edge row mapping pattern** (lines 64-83):
```typescript
return [
  // Start events carry edge metadata captured when the edge begins.
  ...data.edgeStarts.map((edge): EdgeEventRow => ({
    id: edge.id,
    user_id: data.userId,
    trace_id: edge.traceId,
    event_type: 0,
    timestamp_ms: edge.startedAt,
    edge_type: edge.edgeType,
  })),
  // End events only mark completion; edge type is start-only.
  ...data.edgeEnds.map((edge): EdgeEventRow => ({
    id: edge.id,
    user_id: data.userId,
    trace_id: edge.traceId,
    event_type: 1,
    timestamp_ms: edge.endedAt,
    edge_type: null,
  })),
];
```

**ClickHouse insert pattern** (lines 93-118):
```typescript
const nodeRows = this.buildNodeRows(data);
const edgeRows = this.buildEdgeRows(data);

this.logger.trace("Prepared ClickHouse log event rows", {
  userId: data.userId,
  nodeRows: nodeRows.length,
  edgeRows: edgeRows.length,
});

const client = getInitializedClickHouseClient();

if (nodeRows.length > 0) {
  await client.insert({
    table: CLICKHOUSE_NODE_EVENTS_TABLE,
    values: nodeRows,
    format: "JSONEachRow",
  });
}

if (edgeRows.length > 0) {
  await client.insert({
    table: CLICKHOUSE_EDGE_EVENTS_TABLE,
    values: edgeRows,
    format: "JSONEachRow",
  });
}
```

**Copy this pattern:** keep row construction in private helpers and keep inserts structured as `JSONEachRow`. For Phase 1, map start rows to `started_at_ms: edge.startedAt`, `ended_at_ms: null`, `from_node_id: edge.fromNodeId`, `to_node_id: edge.toNodeId`, and `data: edge.data`. Map end rows to `started_at_ms: null`, `ended_at_ms: edge.endedAt`, start-only metadata null/empty, and no invented endpoints.

**Testing note:** the research recommends adding a small optional constructor dependency for a fake ClickHouse client. If added, preserve the current default singleton path so production code still uses `getInitializedClickHouseClient()`.

---

### `hono-server/src/infra/db/clickhouse/schema.ts` (config / schema, batch append storage definition)

**Analog:** `hono-server/src/infra/db/clickhouse/schema.ts`

**DDL string pattern** (lines 1-18):
```typescript
export const CLICKHOUSE_NODE_EVENTS_TABLE = "node_events";
export const CLICKHOUSE_EDGE_EVENTS_TABLE = "edge_events";

export const CLICKHOUSE_CREATE_NODE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_NODE_EVENTS_TABLE}
(
  id String COMMENT 'Node id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  timestamp_ms UInt64 COMMENT 'UTC timestamp in milliseconds for the start or end event',
  node_type Nullable(String) COMMENT 'Node type for start events; null for end events when not provided',
  data Map(String, String) COMMENT 'String key/value payload captured for node start events',
  message Nullable(String) COMMENT 'Start or end message associated with the event',
  importance_level Nullable(Int32) COMMENT 'Node importance level for start events'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, timestamp_ms, event_type);
`;
```

**Edge DDL pattern** (lines 21-32):
```typescript
export const CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_EDGE_EVENTS_TABLE}
(
  id String COMMENT 'Edge id from the traced system',
  user_id String COMMENT 'User id that owns the trace event',
  trace_id String COMMENT 'Trace id that groups related node and edge events',
  event_type UInt8 COMMENT 'Event kind: 0 = start, 1 = end',
  timestamp_ms UInt64 COMMENT 'UTC timestamp in milliseconds for the start or end event',
  edge_type Nullable(String) COMMENT 'Edge type for start events; null for end events when not provided'
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, timestamp_ms, event_type);
`;
```

**Schema export pattern** (lines 35-38):
```typescript
export const CLICKHOUSE_SCHEMA_STATEMENTS = [
  CLICKHOUSE_CREATE_NODE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE,
] as const;
```

**Copy this pattern:** keep DDL constants in this infra file, use explicit column comments, and export through the existing statement array. Replace `timestamp_ms` with nullable `started_at_ms` and `ended_at_ms` in both tables. Add edge columns `from_node_id Nullable(String)`, `to_node_id Nullable(String)`, and `data Map(String, String)`. Prefer `ORDER BY (user_id, trace_id, id, event_type)` unless a live ClickHouse smoke verifies a timestamp expression over nullable lifecycle fields.

---

### `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` (test, event-driven batch validation)

**Analog:** `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts`; test runner from `hono-server/package.json`

**Constructor injection pattern to exploit in tests** (lines 17-25):
```typescript
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

**Behavior under test** (lines 42-78):
```typescript
try {
  // Service owns orchestration; persistence stays behind the repo contract.
  await this.writeRepo.ingestNodesNEdges(data);

  const traceIds = this.getTraceIds(data);
  if (traceIds.length === 0) {
    return;
  }

  await this.eventBus.publish(/* trace events */);
} catch (err) {
  this.logger.error(err);
  throw err;
}
```

**Bun availability pattern** (`hono-server/package.json` lines 4-11):
```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy --minify",
  "cf-typegen": "wrangler types --env-interface CloudflareBindings",
  "fallow": "fallow audit --base HEAD",
  "fallow:full": "fallow",
  "fallow:health": "fallow health --report-only",
  "fallow:fix": "fallow fix --dry-run"
}
```

**Copy this pattern:** use `bun:test` directly; no test framework exists in `package.json`. Create fake `ILogWriteRepo` and fake `IEventBus` objects. Assert malformed edge starts throw before repo persistence and before publish. Assert self-edges with non-empty endpoints reach the repo and publish. Assert a repo failure is rethrown and does not publish.

---

### `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` (test, batch append row transform)

**Analog:** `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts`; optional fake client seam from research

**Rows-to-insert behavior under test** (lines 93-118):
```typescript
const nodeRows = this.buildNodeRows(data);
const edgeRows = this.buildEdgeRows(data);

const client = getInitializedClickHouseClient();

if (nodeRows.length > 0) {
  await client.insert({
    table: CLICKHOUSE_NODE_EVENTS_TABLE,
    values: nodeRows,
    format: "JSONEachRow",
  });
}

if (edgeRows.length > 0) {
  await client.insert({
    table: CLICKHOUSE_EDGE_EVENTS_TABLE,
    values: edgeRows,
    format: "JSONEachRow",
  });
}
```

**ClickHouse singleton fallback pattern** (`hono-server/src/infra/db/clickhouse/clickhouse.ts` lines 66-73):
```typescript
// Repositories run below route/middleware code, so they should not know about
// Hono context. initClickHouse() must run first and populate this singleton.
export const getInitializedClickHouseClient = (): ClickHouseClient => {
  if (!clickHouseClient) {
    throw new Error("ClickHouse client has not been initialized.");
  }
  return clickHouseClient;
};
```

**Copy this pattern:** test the repository through `ingestNodesNEdges`, not by exporting private builders. Prefer constructor injection for a fake client while preserving `getInitializedClickHouseClient()` as the default production path. Capture `insert` calls and assert `table`, `format: "JSONEachRow"`, and exact row values for edge start/end lifecycle columns, endpoint columns, and `data`.

---

## Shared Patterns

### Service Wiring

**Source:** `hono-server/src/services/log/index.ts` lines 1-6
**Apply to:** service construction and tests that instantiate `LogServiceImpl`

```typescript
import { rootLogger } from "../../common/logger";
import { eventBus } from "../../infra/event-bus";
import { ILogService } from "./api/ILogService";
import { LogServiceImpl } from "./internal/service-impl/LogServiceImpl";

export const logService: ILogService = new LogServiceImpl(rootLogger, eventBus);
```

### Event Bus Publishing

**Source:** `hono-server/src/infra/event-bus/api/types.ts` lines 1-14
**Apply to:** `LogServiceImpl` publish assertions and fake event bus shape

```typescript
export type EventBusPublishEvent = {
  topic: string;
  /**
   * Stable identity for the logical work. Implementations use this for
   * idempotency, dedupe, or coalescing when the backend supports or emulates it.
   */
  idempotencyId: string;
  /**
   * Ordering lane for related events. Use values such as userId:traceId when
   * work for the same trace should be processed in order or coalesced.
   */
  key?: string;
  data: unknown;
};
```

### In-Process Event Test Double Shape

**Source:** `hono-server/src/infra/event-bus/internal/DevEventBus.ts` lines 13-29
**Apply to:** `LogServiceImpl.test.ts`

```typescript
async publish(
  events: EventBusPublishEvent[],
  options?: EventBusPublishOptions,
): Promise<void> {
  void options;

  await this.deliverByTopic(this.groupByTopic(events));
}

async subscribe(
  options: EventBusSubscribeOptions,
  handler: EventBusHandler,
): Promise<void> {
  const handlers = this.handlersByTopic.get(options.topic) ?? [];
  handlers.push(handler);
  this.handlersByTopic.set(options.topic, handlers);
}
```

### Error Handling

**Source:** `hono-server/src/services/auth/internal/service-impl/AuthServiceImpl.ts` lines 34-37 and `LogServiceImpl.ts` lines 75-78
**Apply to:** service validation and repository failure paths

```typescript
} catch (err) {
  this.logger.error(err);
  throw err;
}
```

Expected business validation errors can use plain `Error` for this phase unless the planner chooses `TopoTraceException`. The Hono guide allows domain errors, but no route/error translation work is in scope.

### Safe Logging

**Source:** `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` lines 96-100
**Apply to:** service and repository changes

```typescript
this.logger.trace("Prepared ClickHouse log event rows", {
  userId: data.userId,
  nodeRows: nodeRows.length,
  edgeRows: edgeRows.length,
});
```

Use counts and IDs. Do not log raw `data` maps or full ingest payloads.

### ClickHouse Client Boundary

**Source:** `hono-server/src/infra/db/clickhouse/clickhouse.ts` lines 59-73
**Apply to:** repository implementation and fake client injection

```typescript
// Env bindings come from Hono context, so the first request creates the client.
// After that, use the singleton whenever the runtime keeps this module alive.
export const getClickHouseClient = (c: ClickHouseContext): ClickHouseClient => {
  clickHouseClient ??= createClickHouseClient(getClickHouseClientConfig(c));
  return clickHouseClient;
};

// Repositories run below route/middleware code, so they should not know about
// Hono context. initClickHouse() must run first and populate this singleton.
export const getInitializedClickHouseClient = (): ClickHouseClient => {
  if (!clickHouseClient) {
    throw new Error("ClickHouse client has not been initialized.");
  }
  return clickHouseClient;
};
```

Repositories should not import Hono context or read environment values.

## No Analog Found

No files in this phase lack a Hono analog. The two new test files do not have existing test files in `hono-server`, but they have strong implementation analogs and use Bun's built-in test runner from the validation strategy.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| _None_ | _n/a_ | _n/a_ | Every planned file maps to an existing Hono contract, service, repo, schema, or package pattern. |

## Optional / Verify-Only Files

| File | Recommendation |
|------|----------------|
| `hono-server/package.json` | Do not change unless the planner wants a stable `"test": "bun test"` script. Direct `bun test` commands are already acceptable in `01-VALIDATION.md`. |

## Metadata

**Analog search scope:** `hono-server/src`, `hono-server/package.json`
**Files scanned:** 31 Hono source/package files
**Pattern extraction date:** 2026-06-04
**Project-local skills:** none found under `.codex/skills` or `.agents/skills`
**Hono-only compliance:** no source analogs were read from `carno.js`; all excerpts come from `hono-server`.

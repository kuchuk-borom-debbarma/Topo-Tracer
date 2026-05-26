# Multi-Resolution Zoom Closure Engine

**Document Version:** 1.0  
**Branch:** `feat/multi-resolution-zoom`  
**Status:** Implemented (Idempotency deferred)

---

## 1. Overview

The Multi-Resolution Zoom Closure Engine is a background materialization system built into `carno.js` that pre-computes call-graph visual connections at every possible stack depth level for any distributed trace.

Its primary goal is to enable **instant, zero-join, sub-millisecond visual zoom queries** — allowing a frontend to "zoom in" to a trace from the outermost container view all the way down to an individual function span — without performing any graph traversal at query time.

### Core Design Axioms

| Axiom | Detail |
|---|---|
| **CQRS Separation** | Writes (telemetry ingestion) and reads (trace queries) are completely decoupled. They never block each other. |
| **Append-Only Ingestion** | Primary tables (`nodes`, `edges`) are strictly append-only. No in-place updates ever happen to ingested telemetry. |
| **Background Materialization** | All hierarchy resolution and visual wire pre-computation happen asynchronously in the background after ingestion. |
| **Constant Memory Footprint** | The background engine processes records in fixed batches of 1000. At no point does it hold more than 1000 records in RAM, regardless of trace size. |
| **Database-Backed Caching** | Instead of passing large in-memory maps across message broker payloads, resolved ancestry paths are persisted in dedicated ClickHouse cache tables between processing stages. |
| **Non-Blocking Event Loop** | Each batch yields the server event loop by publishing a broker event to process the next chunk rather than running a synchronous loop. |

---

## 2. System Architecture

### 2.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          INGESTION PATH (Fast Writes)                           │
│                                                                                 │
│   Client  ──►  LogController  ──►  LogServiceImpl  ──►  LogRepoClickHouseImpl  │
│                                                              │                  │
│                                              Inserts into:  │                  │
│                                        toco_tracer.nodes    │                  │
│                                        toco_tracer.edges    │                  │
│                                                              │                  │
│                                      Publishes trigger ──►  MessageBroker      │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     BACKGROUND MATERIALIZATION ENGINE                           │
│                                                                                 │
│  TraceMaterializationListener                                                   │
│        │                                                                        │
│        ├──► Stage 1: TraceNodeResolver                                         │
│        │         Resolves node ancestry paths ──► node_ancestry                │
│        │                                                                        │
│        ├──► Stage 2: TraceEdgeResolver                                         │
│        │         Resolves edge egress paths ──► edge_egress_ancestry            │
│        │                                                                        │
│        └──► Stage 3: TraceClosureBuilder                                       │
│                  Generates visual wires ──► read_edges                         │
│                  Marks is_zoom_ready = 1 ──► trace_metadata                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          QUERY PATH (Fast Reads)                                │
│                                                                                 │
│   Client  ──►  fetchTracePaginated(traceId, { depth: d })                      │
│                     │                                                           │
│                     ├── SELECT nodes WHERE depthIndex <= d                      │
│                     ├── SELECT edges WHERE fromNodeId IN (...)                  │
│                     └── SELECT * FROM read_edges WHERE visual_depth = d         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

All tables live in the `toco_tracer` ClickHouse database.

### 3.1 Primary Telemetry Tables (Append-Only, Never Updated)

#### `toco_tracer.nodes`
Stores every individual checkpoint (span) within a distributed trace.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.nodes (
  id              String,
  trace_id        String,         -- Groups all spans of a single request
  containerId     String,         -- The physical host that ran this span
  parentNodeId    String,         -- Direct parent span ID (empty string if root)
  name            String,
  nodeType        String,
  depthIndex      UInt32,         -- Call stack depth (0 = root)
  metadata        String,         -- JSON-serialized bag
  initiatedAtLocal  Int64,        -- Epoch ms (local clock)
  processedAtLocal  Int64,
  completedAtLocal  Nullable(Int64),
  ancestryPath    Array(String)   -- Reserved; populated by background engine
) ENGINE = MergeTree()
ORDER BY (trace_id, depthIndex, initiatedAtLocal);
```

#### `toco_tracer.edges`
Stores every network hop between two containers within a trace.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.edges (
  id                String,
  trace_id          String,
  fromContainerId   String,
  toContainerId     String,
  fromNodeId        String,       -- The originating span ID
  toNodeId          String,       -- The receiving span ID
  edgeType          String,       -- e.g. "http", "grpc", "queue"
  dispatchedAtLocal   Int64,
  respondedAtLocal    Nullable(Int64),
  egressAncestryPath  Array(String)  -- Reserved; populated by background engine
) ENGINE = MergeTree()
ORDER BY (trace_id, dispatchedAtLocal);
```

### 3.2 Materialization Cache Tables (Written by Background Engine)

These tables store intermediate computed results between the three processing stages.
They are internal to the materialization system and are never exposed via the public API.

#### `toco_tracer.node_ancestry`
Stores the fully-resolved call stack ancestry path for every node in a trace, keyed by `(trace_id, node_id)` for O(1) point lookups.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.node_ancestry (
  node_id       String,
  trace_id      String,
  ancestryPath  Array(String)   -- ['root_id', 'parent_id', ..., 'self_id']
) ENGINE = MergeTree()
ORDER BY (trace_id, node_id);
```

**Written by:** `TraceNodeResolver` (Stage 1)  
**Read by:** `TraceEdgeResolver` (Stage 2)

#### `toco_tracer.edge_egress_ancestry`
Stores the ancestry path of the originating node for each edge.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.edge_egress_ancestry (
  edge_id             String,
  trace_id            String,
  egressAncestryPath  Array(String)
) ENGINE = MergeTree()
ORDER BY (trace_id, edge_id);
```

**Written by:** `TraceEdgeResolver` (Stage 2)  
**Read by:** `TraceClosureBuilder` (Stage 3)

### 3.3 Read-Optimized Output Tables

These tables are the final output of the materialization engine and are directly queried by the API.

#### `toco_tracer.read_edges`
Stores pre-computed, snapped visual connection endpoints for every visual depth level.
For a trace with `D` max depth and `E` edges, this table will contain `E × (D+1)` rows.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
  id                String,          -- Composite key: "{edge_id}_{depth}"
  edge_id           String,
  trace_id          String,
  visual_depth      UInt32,          -- The zoom depth this wire belongs to
  from_target_id    String,          -- The snapped origin ID
  from_target_type  String,          -- "container" or "node"
  to_node_id        String
) ENGINE = MergeTree()
ORDER BY (trace_id, visual_depth, id);
```

**Written by:** `TraceClosureBuilder` (Stage 3)  
**Read by:** `LogRepoClickHouseImpl.fetchTracePaginated`

#### `toco_tracer.trace_metadata`
Stores the real-time materialization progress and final completion status for a trace.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.trace_metadata (
  trace_id              String,
  is_zoom_ready         UInt8,    -- 1 = fully materialized, 0 = in progress
  max_available_depth   UInt32,   -- Deepest stack depth index in this trace
  materialized_offset   UInt32    -- How many records have been processed
) ENGINE = MergeTree()
ORDER BY trace_id;
```

**Written by:** All three stages  
**Read by:** `LogRepoClickHouseImpl.ensureMaterialized`

---

## 4. The Message Broker

**File:** [`src/infra/message/MessageBroker.ts`](../carno.js/src/infra/message/MessageBroker.ts)  
**Implementation:** [`src/infra/message/InMemoryMessageBroker.ts`](../carno.js/src/infra/message/InMemoryMessageBroker.ts)

The message broker is the backbone of the event-driven background system. It enables the three stages to execute non-blocking and independently, with the event loop able to handle other server requests between each batch.

### Message Payload Schema

Every message published to the `trace_materialization` topic carries a **constant-size, tiny payload**:

```typescript
{
  traceId: string;    // The trace being processed
  stage:
    | "RESOLVE_NODES"   // Stage 1: resolve node ancestry paths
    | "RESOLVE_EDGES"   // Stage 2: resolve edge egress paths
    | "BUILD_CLOSURES"; // Stage 3: build snapped visual wires
  offset: number;     // The row offset to start processing from (for chunking)
  maxDepth: number;   // The current known maximum stack depth
  iteration: number;  // Safety counter; aborts if > 100 (prevents runaway loops)
}
```

> **Critical Design Note:** The payload never carries large arrays, ancestry maps, or any data that grows with trace size. The broker is strictly a lightweight signalling system. All heavy data is stored in and retrieved from the database.

---

## 5. The Materialization Engine (3-Stage Pipeline)

The engine is coordinated by the `TraceMaterializationListener`, which subscribes to the `trace_materialization` topic on boot and delegates to the appropriate isolated operator based on the `stage` field.

### How Chunking Works

Each operator processes exactly `BATCH_SIZE = 1000` records per invocation. If there are more records remaining:

1. It processes the current 1000 records.
2. It writes the results to the database.
3. It publishes a **new broker event** with `offset: offset + 1000`.
4. It returns — yielding the event loop.

The next invocation picks up at the new offset. This continues until the batch returns fewer than 1000 records, signalling completion.

```
offset=0      → process rows 0–999     → publish { offset: 1000 }
offset=1000   → process rows 1000–1999 → publish { offset: 2000 }
offset=2000   → process rows 2000–2749 → batch < 1000, stage complete
                                        → publish next stage event
```

### Safety Guards

| Guard | Value | Purpose |
|---|---|---|
| `BATCH_SIZE` | `1000` | Maximum rows loaded into RAM per invocation |
| `MAX_DEPTH_LIMIT` | `100` | Maximum depth traversal in the fallback path to prevent infinite loops on cyclic/malformed traces |
| `iteration` cap | `100` | Absolute maximum broker re-emissions per trace to prevent runaway processing |
| Debounce lock | `15 seconds` | Prevents duplicate materialization triggers for the same traceId within a 15-second window |

---

### Stage 1: `TraceNodeResolver` — Node Ancestry Resolution

**File:** [`src/services/log/internal/listeners/operators/TraceNodeResolver.ts`](../carno.js/src/services/log/internal/listeners/operators/TraceNodeResolver.ts)

**Responsibility:** For every node in the trace, compute the full ancestry path — an ordered array of ancestor node IDs from the root span down to the node itself: `['root', 'grandparent', 'parent', 'self']`.

#### Algorithm (per batch of 1000 nodes)

**Step 1 — Fetch 1000 nodes chronologically.**
```sql
SELECT * FROM toco_tracer.nodes
WHERE trace_id = :traceId
ORDER BY initiatedAtLocal ASC, id ASC
LIMIT 1000 OFFSET :offset
```
Since nodes are fetched in chronological order, and distributed traces are typically recorded in execution order, parents will almost always appear before their children in this sequence.

**Step 2 — Identify external parent IDs.**
Build a `localNodeMap` of all nodes in this batch. For any node whose `parentNodeId` is NOT in the local batch (i.e. the parent was processed in a previous batch), collect it into `externalParentIds`.

**Step 3 — Query `node_ancestry` for external parent paths.**
```sql
SELECT node_id, ancestryPath FROM toco_tracer.node_ancestry
WHERE trace_id = :traceId AND node_id IN (:parentIds)
```
Because Stage 1 processes batches sequentially and writes to `node_ancestry` after each batch, previous batches' results are always available in the database when the next batch runs.

**Step 4 — Resolve paths for all 1000 nodes.**
Using the local map and the DB-fetched ancestry map, compute the full ancestry path for each node recursively. A `resolvedPaths` cache avoids redundant work within the same batch call.

**Fallback:** If a parent is missing from both the local map and `node_ancestry` (e.g. due to out-of-order telemetry ingestion), a direct query is made to the primary `nodes` table. The traversal is capped at `MAX_DEPTH_LIMIT = 100` to guard against malformed cycles.

**Step 5 — Bulk insert into `node_ancestry`.**
```sql
INSERT INTO toco_tracer.node_ancestry VALUES (node_id, trace_id, ancestryPath)
```

**Step 6 — Update `trace_metadata` offset progress.**

**Step 7 — Publish next event.**
- If `rawNodes.length < 1000` → Stage 1 is complete. Publish `{ stage: "RESOLVE_EDGES", offset: 0 }`.
- Otherwise → Publish `{ stage: "RESOLVE_NODES", offset: offset + 1000 }`.

#### Memory Guarantee

At any point during Stage 1, RAM holds at most:
- `1000` raw node rows from ClickHouse
- `≤ 1000` parent ancestry arrays fetched from `node_ancestry`
- `1000` resolved ancestry arrays being built
- The `resolvedPaths` Map (in-batch deduplication, bounded by batch size)

**Total peak RAM: < 5MB regardless of total trace size.**

---

### Stage 2: `TraceEdgeResolver` — Edge Egress Path Resolution

**File:** [`src/services/log/internal/listeners/operators/TraceEdgeResolver.ts`](../carno.js/src/services/log/internal/listeners/operators/TraceEdgeResolver.ts)

**Responsibility:** For every edge in the trace, attach the fully-resolved ancestry path of its originating node (`fromNodeId`). This is called the **egress ancestry path** — it tells Stage 3 which call stack the network call was dispatched from.

**Precondition:** Stage 2 only begins after Stage 1 is 100% complete. This guarantees that **every node's ancestry path is already in `node_ancestry`** by the time Stage 2 starts. There is no recursion, tree climbing, or fallback needed.

#### Algorithm (per batch of 1000 edges)

**Step 1 — Fetch 1000 edges chronologically.**
```sql
SELECT * FROM toco_tracer.edges
WHERE trace_id = :traceId
ORDER BY dispatchedAtLocal ASC, id ASC
LIMIT 1000 OFFSET :offset
```

**Step 2 — Collect all distinct `fromNodeId`s from the batch.**
Deduplicate using a `Set` to avoid redundant DB lookups.

**Step 3 — Single batch lookup against `node_ancestry`.**
```sql
SELECT node_id, ancestryPath FROM toco_tracer.node_ancestry
WHERE trace_id = :traceId AND node_id IN (:fromNodeIds)
```
Since Stage 1 is fully complete, every `fromNodeId` is guaranteed to have an entry. This is an O(1) primary key index seek per node ID.

**Step 4 — Map each edge to its egress path and bulk insert into `edge_egress_ancestry`.**
```sql
INSERT INTO toco_tracer.edge_egress_ancestry VALUES (edge_id, trace_id, egressAncestryPath)
```

**Step 5 — Publish next event.**
- If `rawEdges.length < 1000` → Stage 2 complete. Publish `{ stage: "BUILD_CLOSURES", offset: 0 }`.
- Otherwise → Publish `{ stage: "RESOLVE_EDGES", offset: offset + 1000 }`.

---

### Stage 3: `TraceClosureBuilder` — Visual Wire Snapping

**File:** [`src/services/log/internal/listeners/operators/TraceClosureBuilder.ts`](../carno.js/src/services/log/internal/listeners/operators/TraceClosureBuilder.ts)

**Responsibility:** Generate one snapped visual wire per edge per depth level (from depth `0` to `maxDepth`). These pre-computed wires are what the frontend queries directly when a user zooms in to a specific call stack depth.

**Precondition:** Stage 3 only begins after Stage 2 is 100% complete. Every edge's egress ancestry path is pre-computed and available in `edge_egress_ancestry`.

#### Visual Wire Snapping Logic

For each edge and for each depth level `d`:

```
d = 0  →  from_target = { id: edge.fromContainerId, type: "container" }
          (Zoomed all the way out — connections snap to physical containers)

d > 0  →  if d < egressAncestryPath.length:
               from_target = { id: egressAncestryPath[d], type: "node" }
               (Snap to the ancestor node at depth d in the call stack)
           else:
               from_target = { id: edge.fromNodeId, type: "node" }
               (Path is shallower than requested depth; snap to leaf node)
```

#### Example

Suppose an edge is dispatched from a node with this ancestry path:
```
ancestryPath = ['span_gateway', 'span_auth', 'span_db_query']
                    depth=0          depth=1        depth=2
```

The generated visual wires for this edge would be:

| `visual_depth` | `from_target_id`   | `from_target_type` |
|---|---|---|
| `0` | `con_gateway` (container) | `container` |
| `1` | `span_gateway` | `node` |
| `2` | `span_auth` | `node` |
| `3` | `span_db_query` (leaf fallback) | `node` |

#### Algorithm (per batch of 1000 edges)

**Step 1 — Fetch 1000 edges chronologically from `toco_tracer.edges`.**

**Step 2 — Batch lookup against `edge_egress_ancestry`.**
```sql
SELECT edge_id, egressAncestryPath FROM toco_tracer.edge_egress_ancestry
WHERE trace_id = :traceId AND edge_id IN (:edgeIds)
```

**Step 3 — Generate visual wires.**
For each edge, iterate `d` from `0` to `min(maxDepth, 100)` and apply the snapping logic above. Each wire becomes one row in `read_edges`.

**Step 4 — Bulk insert into `read_edges`.**
```sql
INSERT INTO toco_tracer.read_edges VALUES (id, edge_id, trace_id, visual_depth, from_target_id, from_target_type, to_node_id)
```

**Step 5 — Update `trace_metadata` and publish next event.**
- If `rawEdges.length < 1000` → Mark `is_zoom_ready = 1`. Stage 3 complete. No further events published.
- Otherwise → Publish `{ stage: "BUILD_CLOSURES", offset: offset + 1000 }`.

---

## 6. Materialization Trigger & Debouncing

**File:** [`src/services/log/internal/repo-impls/LogRepoClickHouseImpl.ts`](../carno.js/src/services/log/internal/repo-impls/LogRepoClickHouseImpl.ts)

### Proactive Write-Time Trigger

When nodes or edges are saved, `LogRepoClickHouseImpl` immediately fires a background materialization trigger for each distinct `traceId` in the ingested batch:

```typescript
const distinctTraceIds = Array.from(new Set(nodes.map(n => n.traceId))).filter(Boolean);
for (const traceId of distinctTraceIds) {
  this.triggerMaterialization(traceId).catch(...);
}
```

This is a **fire-and-forget async call** that does not block the write response to the client.

### 15-Second Debounce Lock

To prevent the same trace from triggering multiple overlapping materialization runs during rapid ingestion bursts, a static in-memory `Set` tracks recently triggered trace IDs with a 15-second cooldown:

```typescript
private static triggeredTraces = new Set<string>();

if (LogRepoClickHouseImpl.triggeredTraces.has(traceId)) return;
LogRepoClickHouseImpl.triggeredTraces.add(traceId);
setTimeout(() => triggeredTraces.delete(traceId), 15000);
```

### Read-Time Fallback Trigger

During `fetchTracePaginated`, if `trace_metadata` is missing or `is_zoom_ready = 0`, a materialization is triggered. This covers edge cases such as the first query arriving before any writes have fired the proactive trigger.

---

## 7. Query Path — `fetchTracePaginated`

When a client requests a trace at a specific zoom depth `d`:

```typescript
await repo.fetchTracePaginated(traceId, { depth: 2, limit: 50 });
```

The following queries execute in sequence:

**1. Metadata check**
```sql
SELECT is_zoom_ready, max_available_depth
FROM toco_tracer.trace_metadata
WHERE trace_id = :traceId
LIMIT 1
```

**2. Paginated nodes (depth-filtered if depth is provided)**
```sql
SELECT * FROM toco_tracer.nodes
WHERE trace_id = :traceId
  AND depthIndex <= :depth          -- Only if depth param is provided
  AND initiatedAtLocal > :afterTime -- Keyset cursor pagination
ORDER BY initiatedAtLocal ASC, id ASC
LIMIT :fetchLimit
```

**3. Coherent edges (strict graph membership)**
```sql
SELECT * FROM toco_tracer.edges
WHERE trace_id = :traceId
  AND fromNodeId IN (:nodeIds)
  AND toNodeId IN (:nodeIds)
```

**4. Pre-computed visual wires (only if depth param is provided)**
```sql
SELECT * FROM toco_tracer.read_edges
WHERE trace_id = :traceId
  AND visual_depth = :depth
```

Query 4 is a direct primary key index seek on `(trace_id, visual_depth, id)` — it returns results in sub-millisecond time regardless of how many edges exist in the trace.

---

## 8. Code Map

```
carno.js/src/
│
├── infra/
│   ├── ClickHouseService.ts                     — Database connection & all table migrations
│   └── message/
│       ├── MessageBroker.ts                     — Abstract broker interface
│       └── InMemoryMessageBroker.ts             — In-process implementation (for dev/test)
│
└── services/log/
    ├── types.ts                                 — Node, Edge, VisualWire, PaginationParams types
    ├── LogService.ts                            — Public read/write service interface
    └── internal/
        ├── LogRepo.ts                           — Abstract repository interface
        ├── LogServiceImpl.ts                    — Service implementation (enrichment & delegation)
        ├── repo-impls/
        │   └── LogRepoClickHouseImpl.ts         — ClickHouse repository: writes, trigger, reads
        └── listeners/
            ├── TraceMaterializationListener.ts  — Central broker subscriber & stage router
            └── operators/
                ├── TraceNodeResolver.ts         — Stage 1: node ancestry resolution
                ├── TraceEdgeResolver.ts         — Stage 2: edge egress path resolution
                └── TraceClosureBuilder.ts       — Stage 3: visual wire snapping
```

---

## 9. Future Work (Deferred)

| Feature | Description |
|---|---|
| **Idempotency / Re-materialization** | Add `ReplacingMergeTree(version)` engine and timestamp-based versioning to all cache and read tables so re-triggering a trace safely overwrites stale data. |
| **Real Message Broker** | Replace `InMemoryMessageBroker` with a Kafka/Redpanda implementation (infrastructure already provisioned in `docker-compose.yml`). |
| **Partial Trace Updates** | Support appending late-arriving spans to an already-materialized trace without full re-processing. |
| **Visual Wire Pagination** | Apply cursor-based pagination to `read_edges` queries for traces with extreme depth × edge counts. |

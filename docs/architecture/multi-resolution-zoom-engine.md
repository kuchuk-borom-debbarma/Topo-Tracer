# Multi-Resolution Zoom Engine

**Status:** Backend implemented in `carno.js`; frontend and production broker integration are separate concerns.

This document is code-verified against `carno.js/src` as of 2026-05-29.

## Purpose

Topo-Tracer stores telemetry as flat append-only ClickHouse rows, then builds sparse read models for zoomable graph views. The read model lets a UI ask: "At depth `d`, should this network edge snap to a container boundary or to a visible node?"

## Implemented Backend Shape

```text
POST /telemetry/nodes or /telemetry/edges
  -> LogController
  -> LogServiceImpl
  -> LogRepoClickHouseImpl
  -> ClickHouse primary tables
  -> MessageBroker publish(trace_materialization)
  -> TraceMaterializationListener
  -> TraceNodeResolver
  -> TraceEdgeResolver
  -> TraceClosureBuilder
  -> read_edges + trace_metadata
```

Current application services are registered in `carno.js/src/index.ts`:

- `ClickHouseService`
- `LogRepoClickHouseImpl`
- `LogServiceImpl`
- `InMemoryMessageBroker`
- `TraceNodeResolver`
- `TraceEdgeResolver`
- `TraceClosureBuilder`
- `TraceMaterializationListener`

## Database Namespace

The actual ClickHouse database is `toco_tracer`, not `topo_tracer`.

`ClickHouseService` creates:

- `containers`
- `nodes`
- `edges`
- `node_ancestry`
- `edge_egress_ancestry`
- `read_edges`
- `trace_metadata`

No current migration creates `read_layouts`, per-container layout bounds, tenant baggage indexes, or aggregate fleet-map tables.

## Primary Tables

### `toco_tracer.nodes`

Key columns:

```sql
id String,
trace_id String,
containerId String,
parentNodeId String,
name String,
nodeType String,
group String,
depthIndex UInt32,
localDepthIndex UInt32,
metadata String,
initiatedAtLocal Int64,
processedAtLocal Int64,
completedAtLocal Nullable(Int64),
ancestryPath Array(String),
scheduledAtLocal Nullable(Int64),
cpuActiveDurationUs Nullable(Int64),
suspendedAtLocal Array(Int64),
resumedAtLocal Array(Int64)
```

`ORDER BY (trace_id, depthIndex, initiatedAtLocal)`.

### `toco_tracer.edges`

Key columns:

```sql
id String,
trace_id String,
fromContainerId String,
toContainerId String,
fromNodeId String,
toNodeId String,
edgeType String,
dispatchedAtLocal Int64,
respondedAtLocal Nullable(Int64),
egressAncestryPath Array(String)
```

`ORDER BY (trace_id, dispatchedAtLocal)`.

## Materialization Tables

### `toco_tracer.node_ancestry`

Stores node path plus depth arrays:

```sql
node_id String,
trace_id String,
ancestryPath Array(String),
ancestryDepths Array(UInt32),
ancestryLocalDepths Array(UInt32)
```

Parallel arrays matter because global depth and local container depth are not always equal to `ancestryPath` array index.

### `toco_tracer.edge_egress_ancestry`

Stores pre-resolved egress paths for each edge:

```sql
edge_id String,
trace_id String,
egressAncestryPath Array(String),
egressAncestryDepths Array(UInt32),
egressAncestryLocalDepths Array(UInt32)
```

### `toco_tracer.read_edges`

Final sparse visual wire output:

```sql
id String,
edge_id String,
trace_id String,
depth_type Enum8('global' = 1, 'local' = 2),
visual_depth UInt32,
from_target_id String,
from_target_type Enum8('node' = 1, 'container' = 2),
to_target_id String,
to_target_type Enum8('node' = 1, 'container' = 2)
```

Rows are sparse. The engine inserts a new row only when a wire endpoint changes. Do not assume `E * (D + 1)` rows.

### `toco_tracer.trace_metadata`

```sql
trace_id String,
is_zoom_ready UInt8,
max_available_depth UInt32,
max_available_local_depth UInt32,
materialized_offset UInt32
```

Current writes populate readiness and max-depth fields. `materialized_offset` exists in schema but current inserts do not set it explicitly.

## Materialization Pipeline

### Stage 1: Resolve Nodes

`TraceNodeResolver`:

- Fetches `1000` nodes per batch.
- Resolves parent paths from current batch, `node_ancestry`, and fallback `nodes` queries.
- Writes `node_ancestry`.
- Tracks `max_available_depth` and `max_available_local_depth`.
- Publishes next `RESOLVE_NODES` batch or starts `RESOLVE_EDGES`.

### Stage 2: Resolve Edges

`TraceEdgeResolver`:

- Fetches `1000` edges per batch.
- Looks up `fromNodeId` in `node_ancestry`.
- Writes `edge_egress_ancestry`.
- Publishes next `RESOLVE_EDGES` batch or starts `BUILD_CLOSURES`.

### Stage 3: Build Closures

`TraceClosureBuilder`:

- Fetches `1000` edges per batch.
- Reads egress ancestry from `edge_egress_ancestry`.
- Reads ingress ancestry from `node_ancestry` by `toNodeId`.
- Builds both `global` and `local` wire rows.
- Caps depth iteration at `100`.
- Writes sparse rows to `read_edges`.
- Marks trace ready when done.

## Zoom Semantics

`global` mode uses absolute `depthIndex`.

- At global depth `0`, code forces wires to container boundaries.
- For `d > 0`, it snaps to the deepest ancestor with depth `<= d`, or falls back to container if no ancestor is visible.

`local` mode uses `localDepthIndex`.

- At local depth `0`, the code may snap to the root node inside each container.
- This supports API-to-API blueprint views where every service exposes its local entry node.

## Query Path

`fetchTracePaginated(traceId, params)`:

- Calls `ensureMaterialized`.
- Caps `limit` to max `100`.
- Applies keyset pagination using `initiatedAtLocal` and `id`.
- Applies depth filter only when `params.depth` is set.
- Fetches raw edges only when both node IDs are in the current page.
- Fetches sparse visual wires with:

```sql
SELECT * FROM toco_tracer.read_edges
WHERE trace_id = {traceId: String}
  AND depth_type = {depthType: String}
  AND visual_depth <= {depth: UInt32}
ORDER BY visual_depth DESC
LIMIT 1 BY edge_id
```

`fetchTraceFull(traceId, depth, depthType)` uses similar depth filtering and visual wire lookup, without cursor pagination.

## Broker And Idempotency Status

Current backend uses `InMemoryMessageBroker`. It buffers payloads per topic and invokes one local handler batch at a time.

Current trigger debounce:

- `LogRepoClickHouseImpl.triggeredTraces` suppresses duplicate trace triggers for `15` seconds.
- This is process-local and best effort.

Production gaps:

- No durable broker implementation is wired.
- No cross-process idempotency exists.
- Re-running materialization can append duplicate rows because ClickHouse tables are append-oriented and cache tables are not replacement-keyed per logical row.

Before horizontal deployment, implement a durable broker keyed by `traceId` and a dedupe strategy for `(traceId, stage, offset)`.

## Code Map

```text
carno.js/src/
├── index.ts
├── infra/
│   ├── ClickHouseService.ts
│   └── message/
│       ├── MessageBroker.ts
│       └── InMemoryMessageBroker.ts
├── routes/
│   └── LogController.ts
└── services/log/
    ├── LogService.ts
    ├── types.ts
    └── internal/
        ├── LogRepo.ts
        ├── LogServiceImpl.ts
        ├── repo-impls/
        │   └── LogRepoClickHouseImpl.ts
        └── listeners/
            ├── TraceMaterializationListener.ts
            └── operators/
                ├── TraceNodeResolver.ts
                ├── TraceEdgeResolver.ts
                └── TraceClosureBuilder.ts
```

## Known Doc Boundary

Older concept docs in `docs/` describe future layout tables, tenant filtering, fleet maps, and advanced analysis queries. Treat those as product direction unless a matching table/method exists in `carno.js/src`.

# carno.js Trace Materialization Engine

This document reflects current backend code in `carno.js/src` as of 2026-05-29.

The materialization engine turns append-only trace rows into sparse, read-optimized visual wire rows. It exists so trace reads can snap cross-container edges to the correct visible node or container without recursive graph traversal during UI requests.

## Current Architecture

```text
SDK
  -> POST /telemetry/containers
  -> POST /telemetry/nodes
  -> POST /telemetry/edges

LogController
  -> LogServiceImpl
  -> LogRepoClickHouseImpl
  -> ClickHouse tables in toco_tracer

Node/edge writes
  -> MessageBroker topic: trace_materialization
  -> TraceMaterializationListener
  -> TraceNodeResolver
  -> TraceEdgeResolver
  -> TraceClosureBuilder
```

Current broker binding is `InMemoryMessageBroker`. `docker-compose.yml` provisions Redpanda, but no Redpanda-backed broker is wired into `src/index.ts` yet.

## Tables

All tables live under `toco_tracer`.

Primary append-only tables:

| Table | Purpose |
| --- | --- |
| `containers` | Physical or logical execution boundaries. |
| `nodes` | Execution spans/checkpoints. Includes `depthIndex`, `localDepthIndex`, timing fields, metadata, and scheduler/CPU suspension fields. |
| `edges` | Cross-container transitions from `fromNodeId` to `toNodeId`. |

Materialization cache/output tables:

| Table | Purpose |
| --- | --- |
| `node_ancestry` | `ancestryPath`, `ancestryDepths`, and `ancestryLocalDepths` per node. |
| `edge_egress_ancestry` | Egress ancestry arrays per edge. |
| `read_edges` | Sparse snapped wire endpoints per `edge_id`, `depth_type`, and `visual_depth`. |
| `trace_metadata` | `is_zoom_ready`, `max_available_depth`, and `max_available_local_depth`. |

No `read_layouts` or container-layout table exists in current backend code.

## Dual Depth Model

`TraceClosureBuilder` computes sparse wire rows for two modes:

| Mode | Source array | Meaning |
| --- | --- | --- |
| `global` | `ancestryDepths` / `egressAncestryDepths` | Absolute trace depth across services. Depth `0` collapses wires to containers. |
| `local` | `ancestryLocalDepths` / `egressAncestryLocalDepths` | Container-local depth. Depth `0` can snap to each container's root node. |

This is why ancestry caches store parallel arrays instead of assuming array index equals depth.

## Stage 1: `TraceNodeResolver`

File: `src/services/log/internal/listeners/operators/TraceNodeResolver.ts`

Responsibilities:

- Fetch nodes in batches of `1000`.
- Resolve missing parents from `node_ancestry` first, then `nodes`.
- Build `ancestryPath`, `ancestryDepths`, and `ancestryLocalDepths`.
- Insert into `node_ancestry`.
- Update `trace_metadata` max depth fields.
- Re-publish `RESOLVE_NODES` with next offset, or publish `RESOLVE_EDGES` when done.

Important limits:

- `BATCH_SIZE = 1000`
- `MAX_DEPTH_LIMIT = 100`
- Listener aborts jobs when `iteration > 100`, though current operators re-publish with `iteration: 1`.

## Stage 2: `TraceEdgeResolver`

File: `src/services/log/internal/listeners/operators/TraceEdgeResolver.ts`

Responsibilities:

- Fetch edges in batches of `1000`.
- Fetch ancestry for each edge `fromNodeId`.
- Insert `egressAncestryPath`, `egressAncestryDepths`, and `egressAncestryLocalDepths` into `edge_egress_ancestry`.
- Re-publish `RESOLVE_EDGES` with next offset, or publish `BUILD_CLOSURES` when done.

## Stage 3: `TraceClosureBuilder`

File: `src/services/log/internal/listeners/operators/TraceClosureBuilder.ts`

Responsibilities:

- Fetch edges in batches of `1000`.
- Read egress ancestry from `edge_egress_ancestry`.
- Read ingress ancestry from `node_ancestry` using `toNodeId`.
- For both `global` and `local`, iterate visual depths up to `min(maxDepth, 100)`.
- Snap each edge to deepest visible egress and ingress nodes. If no visible node exists, snap to the container boundary.
- Insert sparse rows into `read_edges` only when endpoints change.
- Mark `trace_metadata.is_zoom_ready = true` when all edges finish.

`read_edges` columns:

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

Sparse lookup query shape:

```sql
SELECT * FROM toco_tracer.read_edges
WHERE trace_id = {traceId: String}
  AND depth_type = {depthType: String}
  AND visual_depth <= {depth: UInt32}
ORDER BY visual_depth DESC
LIMIT 1 BY edge_id
```

## Read API Behavior

`GET /telemetry/trace/:traceId` calls `fetchTracePaginated`.

Behavior:

- Checks `trace_metadata`; if missing or not ready, triggers background materialization.
- Caps `limit` to `1..100`.
- Supports keyset pagination with `(initiatedAtLocal, id)`.
- Applies `depthIndex <= depth` for global mode or `localDepthIndex <= depth` for local mode.
- Fetches only coherent raw edges where both endpoints are in current node page.
- Returns `visualWires` when `depth` is provided.

`GET /telemetry/trace/:traceId/full` calls `fetchTraceFull`.

Behavior:

- Returns all matching nodes for trace/depth.
- Fetches coherent raw edges.
- Returns sparse `visualWires` when `depth` is provided.

## Idempotency Reality

Current code uses a static in-process `triggeredTraces` set in `LogRepoClickHouseImpl` to suppress repeated materialization triggers for 15 seconds. This is a traffic debounce only.

Current `InMemoryMessageBroker` is single-process and non-durable. It does not provide cross-process idempotency or replay. A production broker should partition by `traceId` and deduplicate or serialize `(traceId, stage, offset)` jobs.

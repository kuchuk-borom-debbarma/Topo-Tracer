# System Specification: Dynamic Zooming & Layout Engine

This document defines the complete technical architecture, data schemas, background materialization algorithms, and query patterns for implementing the **Dynamic Zooming and Layout Engine** in Topo-Tracer, derived from the core **Block-Nesting Visual Blueprint**.

---

## 1. System Overview & Visual Blueprint

The objective is to replace static call-stack zooming with a **Block-Nesting Visual Blueprint** representing:
*   **X-Axis (Horizontal Nesting Depth of Blocks):** Deeper nested function call blocks are offset to the right.
*   **Y-Axis (Vertical Flow inside Blocks):** Inside each block, operations, steps, and logs are stacked vertically in chronological sequence.
*   **Explicit Flow Jumps (Horizontal Connecting Arrows):** A function call step inside a block draws a clean horizontal connecting arrow to the entry node of the nested block to its right.

```text
+-------------------------------------------------------------------------+
| [Container]                                                             |
|                                                                         |
|  +-----------------+                                                    |
|  | [Block: foo()]  |                                                    |
|  |                 |                                                    |
|  |  [Node: Log 1]  |                                                    |
|  |  [Node: Log 2]  |                                                    |
|  |  [Node: Call]   |----------> +-----------------+                     |
|  |  [Node: Log 3]  |            | [Block: bar()]  |                     |
|  |  [Node: Log 4]  |            |                 |                     |
|  |                 |            |  [Node: Log A]  |                     |
|  +-----------------+            |  [Node: Call]   |-----> +----------+  |
|                                 |  [Node: Log B]  |       | [Block]  |  |
|                                 |                 |       +----------+  |
|                                 +-----------------+                     |
+-------------------------------------------------------------------------+
```

---

## 2. Ingestion Model (Raw Data Schemas)

Ingestion is completely append-only and matches the existing `codex/fe` schemas.

### 2.1 TypeScript Domain Types (`carno.js/src/services/log/types.ts`)
```typescript
export type JsonValue = unknown;

export type TraceContainer = {
  id: string;
  traceId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
  createdAtLocal: Date;
  createdAtRemote: Date;
};

export type TraceBlock = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
};

export type TraceNode = {
  id: string;
  traceId: string;
  blockId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
  eventType: "started" | "ended";
  eventAtLocal: Date;
  ingestedAtRemote: Date;
};

export type TraceEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  metadata?: JsonValue;
  eventType: "requested" | "responded";
  eventAtLocal: Date;
  ingestedAtRemote: Date;
};

export type TraceContainerInput = Omit<TraceContainer, "createdAtRemote">;
export type TraceBlockInput = TraceBlock;
export type TraceNodeInput = Omit<TraceNode, "ingestedAtRemote">;
export type TraceEdgeInput = Omit<TraceEdge, "ingestedAtRemote">;
```

---

## 3. Read-Optimized Zoom Layout Schemas

The background worker populates the following tables to support instant, coordinate-driven rendering.

### 3.1 Trace Blocks Layout: `toco_tracer.read_blocks`
Pre-computes the horizontal coordinates and structural relationships of all blocks.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_blocks (
  id String,                  -- The Block ID
  trace_id String,            -- The Parent Trace ID
  container_id String,        -- Containing container ID
  parent_block_id String,     -- Direct parent block ID (empty if root)
  calling_node_id String,     -- The specific node in parent_block that triggered this block
  name String,
  type String,
  absolute_depth UInt16,      -- Horizontal offset X (0 = root function, 1 = nested function, etc.)
  start_time_us Int64,        -- Derived minimum child start time
  duration_us Nullable(Int64),-- Derived block duration
  metadata String
) ENGINE = MergeTree()
ORDER BY (trace_id, absolute_depth, start_time_us);
```

### 3.2 Trace Nodes Layout: `toco_tracer.read_nodes`
Pre-computes the internal vertical positions of nodes inside each block.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_nodes (
  id String,                  -- The Node ID
  trace_id String,
  block_id String,            -- The containing Block ID
  name String,
  type String,
  zoom_level UInt8,           -- Node importance/verbosity level (0 = critical, 1 = key, 2 = detailed)
  local_sequence UInt32,      -- Vertical flow index Y inside this specific block
  start_time_us Int64,
  duration_us Nullable(Int64),
  metadata String
) ENGINE = MergeTree()
ORDER BY (trace_id, block_id, local_sequence);
```

### 3.3 Visual Wires: `toco_tracer.read_edges`
Stores pre-snapped edge jumps across blocks for dynamic zooming.

```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
  id String,                  -- Unique row ID (edge_id + zoom_level)
  edge_id String,
  trace_id String,
  from_block_id String,       -- Source block ID
  from_node_id String,        -- Source calling node ID
  to_block_id String,         -- Destination block ID
  to_node_id String           -- Destination entry node ID
) ENGINE = MergeTree()
ORDER BY (trace_id, id);
```

---

## 4. Background Materialization Worker

The background worker resolves block timings, node call stack trees, and layouts in three simple phases:

### Phase 1: Collapse Node Lifecycles & local Sequence
1. Pair append-only node events by `id` to compute `start_time_us`, `end_time_us`, and `duration_us`.
2. Group nodes by `block_id`. Sort nodes inside each block by `start_time_us ASC` and assign `local_sequence` (the vertical Y-index starting at 0).
3. Assign node importance `zoom_level` (defaulting to 0 for API controllers, 1 for service functions, 2 for database/step logs).

### Phase 2: Compute Block Nesting Depth (X-Coordinate)
Using the raw `edges` (where an edge connects a calling node in a parent block to the entry node of a child block):
1. Resolve the parent-child block relationships:
   * If a node `A` (in `Block A`) has an edge targeting node `B` (in `Block B`), then `Block B` is a **child block** of `Block A`, triggered by node `A` (`calling_node_id = A`).
2. Sort blocks and calculate their absolute horizontal nesting depths:
   * **Root Blocks** (no incoming calling edges): `absolute_depth = 0`.
   * **Nested Blocks:** `absolute_depth = parent_block.absolute_depth + 1`.

### Phase 3: Bulk Insert
Batch-write the results into `read_blocks`, `read_nodes`, and `read_edges`. Write trace completion status to `toco_tracer.trace_metadata`.

---

## 5. Dynamic Read API

The client queries the layout dynamically.

### 5.1 Route Handler
`GET /telemetry/trace/:traceId?zoom_level=:level`

*   Filters nodes inside blocks dynamically based on the requested verbosity/zoom level.
*   Returns blocks, visible nodes, and horizontal connections.

### 5.2 ClickHouse Queries
```sql
-- 1. Fetch blocks
SELECT * FROM toco_tracer.read_blocks 
WHERE trace_id = {traceId: String} 
ORDER BY absolute_depth ASC, start_time_us ASC;

-- 2. Fetch visible nodes (filtered by verbosity zoom_level)
SELECT * FROM toco_tracer.read_nodes 
WHERE trace_id = {traceId: String} 
  AND zoom_level <= {zoom_level: UInt8} 
ORDER BY block_id, local_sequence ASC;

-- 3. Fetch block connection edges
SELECT * FROM toco_tracer.read_edges 
WHERE trace_id = {traceId: String};
```

---

## 6. Frontend Rendering Blueprint

### 6.1 Rendering Blocks & Nodes
1.  **Block Positioning:** 
    *   Place each block at `left = block.absolute_depth * blockWidth`.
    *   Align the vertical start of `Block B` exactly to the vertical position of its triggering node (`calling_node_id`) inside its parent block.
2.  **Node Stack:**
    *   Render nodes as vertical cards inside their block container in `local_sequence` order.

### 6.2 Drawing Connecting Jumps
Draw a horizontal SVG arrow:
*   **From:** The right edge of the calling node card in the parent block.
*   **To:** The left edge of the entry node card in the child block.
*   Since the child block is aligned vertically opposite to the calling node, the connection draws as a straight, clean horizontal line $\rightarrow$ with zero wire intersections!

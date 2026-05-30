# System Specification: Multi-Resolution Dynamic Zooming & Layout Engine

This specification defines the complete technical architecture, data flows, mathematical models, background compiler algorithms, and query patterns for the **Multi-Resolution Dynamic Zooming and Layout Engine** in Topo-Tracer. This document serves as the master blueprint for human developers and AI agents to understand, maintain, and extend the system.

---

## 1. Executive Summary & Design Philosophy

Distributed tracing traditionally presents developers with a "Wall of Spaghetti"—a massive, unreadable mesh of deep call stacks, verbose logs, and scattered database calls. Topo-Tracer resolves this by combining a **container-swimlane model** with a **multi-resolution dynamic zooming system**.

### The Core Paradigm
1. **Vertical Isolation (Swimlanes):** Physical or logical services (containers) are stacked vertically as horizontal swimlane bands.
2. **Horizontal Progression (Global Columns):** Function blocks are distributed horizontally along a global column sequence derived from their parent-child nesting call depth.
3. **Sequential Flow (Internal Y-Axis):** Inside each block, events flow vertically in chronological sequence.
4. **Link Tunneling (Dynamic Snapping):** When details are zoomed out (omitted from the payload), connecting arrows automatically tunnel back to the nearest visible parent ancestor, preserving the global graph's logical connectivity at any resolution.

---

## 2. End-to-End System Flow

The system operates in four distinct layers across the stack:

```mermaid
flowchart TD
    subgraph Layer1 [1. Telemetry Ingress (Node.js SDK)]
        A[Tracer API Calls] -->|1. Constructor Locks Block ID| B[TraceNode]
        B -->|2. Export Raw Events| C[BatchExporter Queue]
        C -->|3. POST Bulk Payload| D[Carno.js API Endpoints]
    end

    subgraph Layer2 [2. Raw Ingestion & Worker (Backend)]
        D -->|4. Ingest Raw Facts| E[(ClickHouse Raw Tables)]
        E -->|5. Debounce Trigger 10s Window| F[TraceMaterializationWorker]
        F -->|6. Run Compilation Pipeline| G[Layout Compiler Engine]
    end

    subgraph Layer3 [3. Pre-computed Read Layouts]
        G -->|7. Persist Mapped Layouts| H[(ClickHouse Read-Optimized Tables)]
    end

    subgraph Layer4 [4. Query & Render Path (Frontend)]
        I[React UI Slider] -->|8. Request zoom_level=N| J[GET /telemetry/trace/:id?zoom_level=N]
        J -->|9. Index Filter: zoom_level <= N| H
        H -->|10. Send Lean Response| K[computeLayout]
        K -->|11. Dynamic Heights & Coordinates| L[Swimlane Renderer]
        K -->|12. Recursive Ancestry Snapping| M[SVG Wire Overlay]
    end
```

---

## 3. Telemetry Collection & SDK Layer (`sdk/nodejs`)

The SDK is responsible for capturing raw chronological trace facts without computing coordinates.

### 3.1 Primitives & Vocabulary
*   **Container**: A logical namespace or physical microservice (e.g. `container-order-api`).
*   **Block**: An execution frame or function scope (e.g. a class method call, a controller route handler).
*   **Node**: A step, checkpoint, log, or internal operation occurring chronologically inside a Block (e.g., a SQL query, an HTTP request dispatch, a debug log).
*   **Edge**: A parent-to-child caller link crossing Block or Container boundaries.

### 3.2 The Immutable Block ID Locking Mechanism
A major challenge in distributed trace collection is the dynamic mutation of span identifiers as contexts cross networks. To prevent graph corruption:
*   Upon construction, `TraceNode` locks a private readonly block identifier:
    ```typescript
    this.id = opts.overrideId || uuidv4();
    this._blockId = this.id; // Locked permanently
    ```
*   Even if the node's `.id` is mutated externally (e.g. to link with incoming network headers), all child spans and edges refer to the locked `_blockId`. This guarantees that block-hierarchy relationships remain perfectly consistent.

### 3.3 Event Ingress Structure
The SDK streams chronological events asynchronously to the backend in batches using the following raw inputs (`sdk/nodejs/src/types.ts`):

```typescript
export interface TraceContainerInput {
  id: string;
  traceId: string;
  name: string;
  type: string;
  metadata?: any;
  createdAtLocal: Date;
}

export interface TraceBlockInput {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  metadata?: any;
}

export interface TraceNodeInput {
  id: string;
  traceId: string;
  blockId: string;
  name: string;
  type: string;
  eventType: "started" | "ended";
  eventAtLocal: Date;
  metadata?: any;
}

export interface TraceEdgeInput {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  eventType: "requested" | "responded";
  eventAtLocal: Date;
  metadata?: any;
}
```

---

## 4. Storage & Schema Design (ClickHouse)

Carno.js uses a highly parallelized column-oriented ClickHouse schema to split data between **raw append-only telemetry** and **read-optimized layout structures**.

### 4.1 Raw Ingestion Tables
Raw tables store append-only telemetry facts exactly as dispatched by the SDK.
*   **`toco_tracer.containers`**: Track registered microservices.
*   **`toco_tracer.blocks`**: Log execution block boundaries.
*   **`toco_tracer.nodes`**: Record append-only node events (lifecycles starting/ending).
*   **`toco_tracer.edges`**: Record call/response transition links.

### 4.2 Read-Optimized Layout Tables
Populated by the background compiler, these tables pre-compute coordinate offsets and sequences.

#### `toco_tracer.read_blocks`
Stores the horizontal positions and parentage of each block.
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_blocks (
  id String,                  -- Unique ID of the block
  trace_id String,            -- The parent trace ID
  container_id String,        -- Container/service where this block ran
  parent_block_id String,     -- Direct parent block ID (empty if root)
  calling_node_id String,     -- Node in parent_block that triggered this call
  name String,                -- Block name (e.g. 'processPayment()')
  type String,                -- Block type
  absolute_depth UInt16,      -- Global horizontal depth column (X-axis index)
  start_time_us Int64,        -- Earliest start timestamp derived from nodes
  duration_us Nullable(Int64),-- Derived block duration
  ancestry_path Array(String),-- Pre-computed lineage path for visual grouping
  metadata String             -- Custom bag properties
) ENGINE = MergeTree()
ORDER BY (trace_id, absolute_depth, start_time_us);
```

#### `toco_tracer.read_nodes`
Pre-calculates vertical sequence offsets and zoom threshholds.
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_nodes (
  id String,                  -- Unique ID of the node
  trace_id String,            -- The parent trace ID
  block_id String,            -- The containing block ID
  name String,                -- Node description
  type String,                -- Node type (e.g. 'db', 'http_server')
  zoom_level UInt8,           -- Visual importance threshold (0=Critical, 1=Key, 2=Detailed)
  local_sequence UInt32,      -- Pre-computed chronological vertical sequence index (Y-axis)
  start_time_us Int64,        -- Start time of node in microseconds
  duration_us Nullable(Int64),-- Node duration in microseconds
  ancestry_path Array(String),-- Lineage path: [containerId, blockId, nodeId]
  metadata String             -- Raw metadata
) ENGINE = MergeTree()
ORDER BY (trace_id, block_id, local_sequence);
```

#### `toco_tracer.read_edges`
Tracks cross-block connecting wires.
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
  id String,                  -- Unique wire row ID
  edge_id String,             -- Corresponding raw edge ID
  trace_id String,            -- The parent trace ID
  from_block_id String,       -- Source block ID
  from_node_id String,        -- Source calling node ID
  to_block_id String,         -- Target block ID
  to_node_id String           -- Target entry node ID
) ENGINE = MergeTree()
ORDER BY (trace_id, id);
```

#### `toco_tracer.trace_metadata`
Stores performance slider metrics and materialization states.
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.trace_metadata (
  trace_id String,
  is_zoom_ready UInt8,
  max_available_depth UInt16,
  materialized_offset UInt32
) ENGINE = MergeTree()
ORDER BY (trace_id);
```

---

## 5. Background Materialization Pipeline

Ingested traces trigger a background compiler (`TraceMaterializationWorker.ts`) which resolves raw facts into optimized visual structures.

### 5.1 Debounce & Concurrency Controls
*   **The Ingress Debouncer:** Incoming raw telemetry calls `triggerMaterialization(traceId)`. This starts a **10-second inactive window debouncer**. Each subsequent span write resets the timer, ensuring a trace is fully compiled only after all associated SDK events have finished sending.
*   **Duplicate Safeguards:** The worker maintains a `runningTraces: Set<string>` cache to block parallel compilations of the same trace ID.

### 5.2 Layout Compile Pipeline
When the debouncer fires, the worker executes `materialize()` in four phases:

#### Phase 1: Reconstruct the Hierarchy
The worker pairs starting/ended lifecycle raw node events to collapse durations, and correlates parent-child blocks. An edge connecting a node in Block A to a node in Block B establishes that Block B is a child of Block A.
```typescript
const blockParentMap = new Map<string, string>();      // child block -> parent block
const blockTriggerNodeMap = new Map<string, string>();  // child block -> parent triggering node
```

#### Phase 2: Horizontal Depth Calculation (X-Coordinate Depth)
The compiler recursively resolves the horizontal depth index (`absoluteDepth`) of every block. A root scope starts at depth `0`. Any child block is nested one column to the right of its parent.
```typescript
const blockDepths = new Map<string, number>();
const getBlockDepth = (blockId: string): number => {
  if (blockDepths.has(blockId)) return blockDepths.get(blockId)!;
  const parentId = blockParentMap.get(blockId);
  if (!parentId) {
    blockDepths.set(blockId, 0);
    return 0;
  }
  const depth = getBlockDepth(parentId) + 1;
  blockDepths.set(blockId, depth);
  return depth;
};
```

#### Phase 3: Semantic Zoom Level Assignment
Every node is evaluated and tagged with an importance `zoomLevel` UInt8 based on its operational semantics:
*   **Level 0 (Critical root milestones):** System entry points, RPC servers, and top-level REST controller requests (`http_server`, `rpc_server`, `express_api`).
*   **Level 1 (Key operations - Default):** Middle tier function executions, outgoing service calls, and batch loops.
*   **Level 2 (Detailed debug logs):** High-verbosity operational internals like SQL database queries (`db`), specific trace `step`s, and raw stdout `log` prints.

#### Phase 4: Ancestry Serialization & Persistence
The compiler serializes a lineage path array (`ancestryPath`) for every block and node:
*   Node path: `[containerId, blockId, nodeId]`
*   Block path: `[containerId, parent_block_ids..., current_block_id]`

Finally, coordinates and sequences are batch-inserted into ClickHouse read tables, `maxAvailableDepth` is computed, and `isZoomReady` is set to `true`.

---

## 6. Layout Query Dispatch (Read API)

When the frontend loads or changes the zoom slider, it calls:
`GET /telemetry/trace/:traceId?zoom_level=N`

### ClickHouse Row Parsing Paradigm
To bypass expensive array allocations, `@clickhouse/client`'s generic `.json<T>()` parses the incoming stream by treating `T` as the **individual row schema**, returning a flat, typed array `T[]`.

```typescript
// 1. Fetch trace metadata
const metadata = await this.logRepo.fetchTraceMetadata(traceId);
const activeLevel = zoomLevel !== undefined ? zoomLevel : (metadata?.maxAvailableDepth ?? 2);

// 2. Fetch layout elements (nodes are index-filtered by zoom_level)
const [blocks, nodes, edges] = await Promise.all([
  this.logRepo.fetchReadBlocks(traceId),
  this.logRepo.fetchReadNodes(traceId, activeLevel),
  this.logRepo.fetchReadEdges(traceId),
]);
```

---

## 7. Frontend Coordinate Math Engine

The React engine (`TraceFlowCanvas.tsx` + `layout.ts`) computes exact absolute positions for containers, blocks, and SVG paths on every query update.

### 7.1 Layout Constants
Visual dimensions are strictly controlled by layout constants (`utils/layout.ts`):
```typescript
export const LAYOUT = {
  NODE_H: 44,             // Height of each node row (px)
  NODE_GAP: 5,            // Vertical gap between nodes (px)
  BLOCK_PAD: 10,          // Block internal top/bottom padding (px)
  BLOCK_HEADER_H: 42,     // Block title bar height (px)
  COL_W: 240,             // Block card width (px)
  COL_GAP: 60,            // Horizontal gap between column depths (px)
  CANVAS_PAD: 48,         // Canvas outer padding bounds (px)
  BLOCK_GAP: 12,          // Vertical gap between stacked blocks in same column (px)
  CONTAINER_PAD: 20,      // Internal horizontal/bottom padding of container bands (px)
  CONTAINER_HEADER_H: 34, // Container band header title bar height (px)
  CONTAINER_GAP: 48,      // Vertical gap between stacked containers (px)
} as const;
```

### 7.2 Spacing & Coordinates Math
The algorithm processes layouts sequentially:
1.  **Node Vertical Sequence:** Active visible nodes are sorted by their `localSequence` chronological order inside their block.
2.  **Dynamic Block Heights:** Since blocks only render nodes matching `zoomLevel <= N`, their heights are dynamic:
    $$\text{blockHeight} = \text{BLOCK\_HEADER\_H} + (\text{BLOCK\_PAD} \times 2) + (\text{nodeCount} \times \text{NODE\_H}) + ((\text{nodeCount} - 1) \times \text{NODE\_GAP})$$
3.  **Horizontal Swimlane Dimensions:** Containers are stacked vertically using `currentTop`. For each container swimlane:
    *   Find the minimum and maximum horizontal column depths inside it.
    *   Calculate its bounds (without outer CANVAS_PAD):
        $$\text{left} = (\text{minDepth} \times (\text{COL\_W} + \text{COL\_GAP})) - \text{CONTAINER\_PAD}$$
        $$\text{width} = (\text{maxDepth} \times (\text{COL\_W} + \text{COL\_GAP})) + \text{COL\_W} - \text{left} + \text{CONTAINER\_PAD}$$
        $$\text{height} = \text{CONTAINER\_HEADER\_H} + \text{CONTAINER\_PAD} + \text{maxColHeight} + \text{CONTAINER\_PAD}$$
4.  **Absolute Canvas Mapping:** Coordinate parameters (`top` and `left`) are computed starting from $(0,0)$. The renderer applies the offset `CANVAS_PAD` uniformly at render-time, allowing perfect alignment.

---

## 8. Client-Side Wire Snapping ("Link Tunneling")

When a user selects a low zoom level, high-verbosity nodes (e.g. database logs) are filtered out at the database level and do not exist in the response payload. However, connecting calling edges must not dangle in empty space.

### The Ancestry Snapping Algorithm
The layout engine implements a highly optimized dynamic snapping algorithm in `layout.ts`:

1.  **Deduplicate active node IDs** into a `visibleNodeIds: Set<string>` lookup cache.
2.  For every pre-computed edge wire `fromNodeId -> toNodeId`:
    *   Call `resolveNodeId(nodeId)`:
        *   If the target node is visible, return it.
        *   If it is a helper node (ends with `_caller`), strip the suffix and check if the bare ID is visible.
        *   If it is **hidden**, traverse its pre-compiled `ancestryPath` vector backwards (from deepest child to parent block).
        *   Return the **first (deepest) ancestor ID** that is present in the `visibleNodeIds` set.
3.  **Wire Coalescing & Routing:**
    *   If both endpoints resolve to the same node ID (hidden details collapsed into their parent block), the wire is omitted.
    *   Otherwise, it fetches the coordinate centers:
        *   `fromX = fromNode.blockRight`
        *   `fromY = fromNode.centerY`
        *   `toX = toNode.blockLeft`
        *   `toY = toNode.centerY`
    *   If the parent containers of the resolved endpoints are different, the wire is flagged as `isCrossContainer = true`, drawing a purple dashed wire (`stroke-dasharray: 6 3`) to represent a tunneled cross-service transaction.

---

## 9. Operational Checklists for AI Agents

When tasked to work on this engine, follow these strict execution rules:

### 9.1 Verifying Layout Compile Changes
To verify backend materialization or layout algorithm adjustments:
1.  Clear local ClickHouse table states to avoid stale final merges.
2.  Run ingestion tests:
    ```bash
    cd carno.js && bun test
    ```
3.  Verify that no TypeScript errors exist across all workspace files:
    ```bash
    cd carno.js && bun x tsc --noEmit --skipLibCheck
    cd ../frontend && npm run build
    ```

### 9.2 Modifying Layout Constants
If updating card widths or gaps:
*   Ensure that `utils/layout.ts` constants match CSS styling overrides exactly.
*   The block card CSS width is located in `frontend/src/index.css` under `.block-card` rules; any coordinate change in `LAYOUT.COL_W` MUST be updated in the corresponding CSS rule to avoid overlay offsets.

### 9.3 Customizing Zoom Semantics
To modify which operations are visible at what depth slider level:
*   Edit the type classification matches in `TraceMaterializationWorker.ts` (inside the `readNodesToInsert` loop).
*   Add corresponding color themes to `getNodeColor()` in `utils/layout.ts` and variable themes in `index.css`.

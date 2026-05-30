# Master Specification: Topo-Tracer V3 (Unified Container-Node Tagging & CQRS Snapping Engine)

This document serves as the master technical blueprint and single source of truth for **Topo-Tracer V3**. It defines the telemetry model, the ClickHouse CQRS schema, the SDK nesting APIs, and the frontend dynamic layouter.

---

## 1. Executive Summary & Design Philosophy

 distributed tracing tools suffer from excessive cognitive load by separating services, transaction frames, and event checkpoints into disjoint concepts. Topo-Tracer V3 unifies these paradigms into a **nested Container-Node hierarchy** designed for massive horizontal scalability, ultra-fast queries, and high-fidelity visual tracing.

### The V3 Core Architecture
1.  **Unified Scope Primitives:**
    *   **Container (Scope/Boundary):** Represents a logical frame or boundary (e.g. a microservice, a thread, a function execution context). Containers can be recursively nested inside parent containers.
    *   **Node (Chronological Event):** Represents a leaf step, database query, log print, or REST checkpoint occurring chronologically inside a container.
2.  **Universal Tagging:** Nodes and containers can be decorated with arbitrary string tags (`Array(String)`).
3.  **X/Y Layout Coordinate Grid:**
    *   **X-Axis (Horizontal Nesting):** Parentage nesting progresses horizontally along the X-axis. As containers nest, they shift rightwards.
    *   **Y-Axis (Vertical Flow):** Chronological execution sequence flows vertically down the Y-axis.
4.  **Tag-Based CQRS Ingestion:**
    *   Ingestion streams are append-only. Durations and parentage paths are pre-compiled asynchronously by a materialization worker.
5.  **High-Fidelity AND-Filter Snapping ("Dynamic Link Tunneling"):**
    *   Users specify filter tags in the UI.
    *   The UI renders **only** the nodes and containers that match **all** selected tags (AND logic).
    *   Any connection edges between visible elements remain intact; if an edge connects to a hidden element, it **dynamically snaps to its closest visible parent ancestor container or node** using pre-computed parentage paths!

---

## 2. Telemetry Schema & CQRS Storage (ClickHouse)

We decouple the database into a raw telemetry append-only write path and a read-optimized, pre-computed query path.

```mermaid
flowchart TD
    subgraph SDK [1. Telemetry Collection (Node.js SDK)]
        A[startContainer] -->|Append Start Event| B[raw_containers]
        C[logNode] -->|Append Node Event| D[raw_nodes]
    end

    subgraph ClickHouse [2. Columnar Database Schema (ClickHouse)]
        B --> E[(Raw Append Tables)]
        D --> E
        
        E -->|materialize() debounced 10s| F[TraceMaterializationWorker]
        
        F -->|Pre-compute nesting, parentages & sequence| G[(Read-Optimized Tables)]
    end

    subgraph UI [3. Visualizer UI (Vite + React)]
        H[Enter tags: AND logic] -->|GET /telemetry/trace/:id| I[LogServiceImpl]
        I -->|Query read tables| G
        I -->|Load full trace nodes| J[computeLayout]
        J -->|Visual border snapping| K[Native SVG Canvas]
    end
```

### 2.1 Write Path: Raw Append-Only Ingestion Logs
Ingestion endpoints perform fast `INSERT` writes into append-only raw tables.

#### `toco_tracer.raw_containers`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.raw_containers (
  id String,
  trace_id String,
  parent_container_id String,
  name String,
  type String,
  tags Array(String),
  event_type Enum8('started' = 1, 'ended' = 2),
  timestamp Int64
) ENGINE = MergeTree()
ORDER BY (trace_id, timestamp);
```

#### `toco_tracer.raw_nodes`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.raw_nodes (
  id String,
  trace_id String,
  container_id String,
  name String,
  type String,
  tags Array(String),
  event_type Enum8('started' = 1, 'ended' = 2),
  timestamp Int64,
  metadata String
) ENGINE = MergeTree()
ORDER BY (trace_id, timestamp);
```

#### `toco_tracer.raw_edges`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.raw_edges (
  id String,
  trace_id String,
  from_node_id String,
  to_node_id String,
  type String,
  timestamp Int64
) ENGINE = MergeTree()
ORDER BY (trace_id, timestamp);
```

---

### 2.2 Read Path: Read-Optimized Materialized Structures
Pre-compiled by `TraceMaterializationWorker.ts` asynchronously, these tables represent the fully materialized trace topology.

#### `toco_tracer.read_traces`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_traces (
  trace_id String,
  container_ids Array(String), -- Cached unique container IDs
  tags Array(String),          -- Cached unique tags in the trace for UI autocomplete
  created_at Int64
) ENGINE = MergeTree()
ORDER BY (trace_id);
```

#### `toco_tracer.read_containers`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_containers (
  id String,
  trace_id String,
  parent_container_id String,
  name String,
  type String,
  tags Array(String),
  start_time_us Int64,
  duration_us Nullable(Int64),
  metadata String
) ENGINE = MergeTree()
ORDER BY (trace_id, start_time_us);
```

#### `toco_tracer.read_nodes`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_nodes (
  id String,
  trace_id String,
  container_id String,
  name String,
  type String,
  tags Array(String),
  parentage Array(String),     -- Pre-compiled lineage: [parent_container_ids..., parent_node_id]
  local_sequence UInt32,      -- Chronological index inside container
  start_time_us Int64,
  duration_us Nullable(Int64),
  metadata String
) ENGINE = MergeTree()
ORDER BY (trace_id, container_id, local_sequence);
```

#### `toco_tracer.read_edges`
```sql
CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
  id String,
  trace_id String,
  from_node_id String,
  to_node_id String,
  type String,
  metadata String
) ENGINE = MergeTree()
ORDER BY (trace_id, id);
```

---

## 3. Node.js SDK Telemetry API

The Node.js SDK exports a clean, simplified nesting builder:

```typescript
import { Tracer } from "@topo-tracer/sdk";

// Start root container
const tx = Tracer.startContainer("orderItem", ["tag_checkout", "tag_gateway"]);

// Log a simple chronological row node inside the container
tx.logNode("aNode", ["tag_log"]);

// Promise.all or sub-scope invokes nested sub-containers
const subTx = tx.startChildContainer("checkItem", ["tag_internal"]);
subTx.logNode("checking item", ["tag_debug"]);
subTx.complete(); // Sends container "ended" event

tx.complete();
```

---

## 4. Frontend Layout & Snapping Algorithms

### 4.1 Local Depth Calculations
For each container, the layout engine computes the relative horizontal nesting depth of its blocks recursively:
1.  **Local Depth 0:** Containers or blocks whose parent is empty or resides in a *different* container boundary.
2.  **Local Depth $D > 0$:** Nested elements inside the same container.
    $$\text{localDepth}(X) = \text{localDepth}(\text{parent}(X)) + 1$$

---

### 4.2 Dynamic AND-Filter Selection
Let $T_{UI} = \{t_1, t_2, \dots\}$ be the set of active tags entered by the user in the UI filter bar.
1.  A Node or Container $E$ is **visible** if and only if:
    $$T_{UI} = \emptyset \quad \text{OR} \quad T_{UI} \subseteq \text{tags}(E)$$
2.  If a sub-container has no visible nodes or visible nested sub-containers inside it, it is hidden.

---

### 4.3 Ancestry Link Snapping ("Link Tunneling")
When drawing a connection wire from $S$ to $T$:
1.  Verify if both $S$ and $T$ are visible. If so, draw a wire directly connecting their respective rows.
2.  If $S$ is hidden:
    *   Traverse $S$'s `parentage` array backwards:
        $$\text{Lineage} = [\text{parent}_1, \text{parent}_2, \dots, S]$$
    *   Select the **deepest ancestor ID** that is present in the visible nodes list.
    *   If no ancestor node is visible, snap the endpoint directly to the **closest visible parent Container boundary box** (`container:${id}`).
3.  If a wire resolves to connect an element to itself, it is omitted to prevent visual loops.

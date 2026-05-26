# Topo-Tracer: Core Architecture & Data Specification

This document details the core features, architectural components, and data specifications for **Topo-Tracer**—a distributed tracing framework built from the ground up on graph theory, microsecond-level latency tracking, and automatic progressive zooming.

---

## 1. Core Features

### A. Multi-Resolution Edge Navigation

Instead of forcing a single rigid view, Topo-Tracer implements an automated **Multi-Resolution** layout system. The engine dynamically groups or stretches code elements based on your viewport magnification.

* As you zoom out, deep logical execution paths collapse into compact boxes, and network wires slide up to lock onto high-level container boundaries.
* As you zoom in, the wires seamlessly travel down the family tree to anchor onto individual function rows or microsecond timestamp pixels.

### B. High-Isolation "Lost Time" Metrics

By splitting timestamp collection cleanly between the Node and the Edge, Topo-Tracer isolates machine clock drift. It extracts network transit delays and message broker queue lag automatically without requiring manual developer configurations.

### C. Stacked Concurrency Track Mapping

When parallel processes execute at the same moment (such as parallel database requests), Topo-Tracer freezes horizontal diagonal list indentation. It stacks these sibling tracks vertically on parallel grid paths, immediately distinguishing asynchronous operations from blocking parent-child sequences.

---

## 2. Core Architecture Primitives

The system breaks down the entire telemetry universe into three simple, flat building blocks:

### A. The Container (The Physical Boundary)

A Container represents a long-lived, physical or process-level execution boundary in your infrastructure. Examples include a Docker container, a Kubernetes pod, an AWS Lambda instance, an OS background process, or a browser tab. Containers dictate the physical layout of your fleet.

### B. The Node (The Logical Boundary)

A Node lives strictly inside a Container and represents a discrete, single unit of code execution (e.g., an incoming HTTP route, a middleware function, a controller, or an internal database helper method).

* Every node tracks its position in the call stack using a simple integer counter called a `depth_index`. If Function A calls Function B, the depth ticks up by 1.

### C. The Edge Component (The Relation Bridge)

Edges are independent, data-rich components that map precise connectivity between separate containers. Instead of connecting a single static point to another, an Edge carries a full **Egress Ancestry Path**—a breadcrumb trail of parent IDs stored the exact microsecond an outbound network call occurs. This drives our multi-resolution edge re-anchoring system.

---

## 3. The Microsecond Lifecycle Matrix

To find exactly where a system is slowing down, Topo-Tracer splits timestamps cleanly between the **Node** (the internal code) and the **Edge** (the network crossing).

### Node Timestamps (Internal Code Performance)

* `initiatedAt`: When the function block starts running locally.
* `processedAt`: When the core internal calculation logic finishes.
* `completedAt`: When the function completely wraps up (after all its child functions or outbound network lines finish executing and return strings).

### Edge Timestamps (Network & Transport Performance)

* `dispatchedAt`: When the serialized data leaves the sender's network card or memory buffer.
* `reachedAt`: When the data physically arrives at the receiver container's boundary interface.
* `acceptedAt`: When the receiver's execution runtime engine actually plucks the item from the queue or socket to boot up its thread context.

### The Calculus

$$\begin{aligned}
\mathbf{Wire\ Transit\ (Network\ Delay)} &\quad=\quad \text{edge.reachedAt} - \text{edge.dispatchedAt} \
&\quad\quad\quad \textit{(Exposes network drops, proxy routing, or service mesh overhead)} \
\mathbf{Queue\ Lag\ (Worker\ Starvation)} &\quad=\quad \text{edge.acceptedAt} - \text{edge.reachedAt} \
&\quad\quad\quad \textit{(Exposes "Lost Time" spent waiting for an available executor thread)} \
\mathbf{Pure\ Processing\ Time} &\quad=\quad \text{node.processedAt} - \text{node.initiatedAt} \
&\quad\quad\quad \textit{(Isolates execution time spent inside the actual application logic)} \
\mathbf{Callback\ Cascade\ Delay} &\quad=\quad \text{node.completedAt} - \text{node.processedAt} \
&\quad\quad\quad \textit{(Exposes time spent waiting for nested child hierarchies to unwind)}
\end{aligned}$$

---

## 4. Production Data Architecture

The underlying storage layer remains fully flat and normalized, optimized for append-only, high-throughput time-series engines (like ClickHouse) to handle heavy streaming write loads without concurrency locks or document-stitching overhead.

### A. Nodes Table Payload

```json
{
  "id": "node_kafka_pub_99a",
  "trace_id": "tx_987654321_kbd",
  "container_id": "con_api_prod_7a81",
  "parent_node_id": "node_controller_foo_44b",
  "depth_index": 4,
  "kind": "publish",
  "name": "kafka::publish_event",
  "meta": {
    "topic": "task.events",
    "payload_bytes": 512
  },
  "timestamps": {
    "initiatedAt": 1779905412010200,
    "processedAt": 1779905412015100,
    "completedAt": 1779905412015200
  }
}

```

### B. Edges Table Payload

```json
{
  "id": "edge_cross_wire_331",
  "trace_id": "tx_987654321_kbd",
  "from_container_id": "con_api_prod_7a81",
  "to_container_id": "con_worker_prod_11b2",
  "from_node_id": "node_kafka_pub_99a",
  "to_node_id": "node_worker_consume_002",
  "egress_ancestry_path": [
    "node_kafka_pub_99a",
    "node_func_b_33a",
    "node_service_bar_12c",
    "node_controller_foo_44b"
  ],
  "crossing_kind": "queue",
  "timestamps": {
    "dispatchedAt": 1779905412015150,
    "reachedAt": 1779905412015170,
    "acceptedAt": 1779905412015186
  }
}

```

---

## 5. The Multi-Resolution Sliding Window Engine

Because code hierarchies can go infinitely deep, Topo-Tracer avoids fixed sizing categories. Instead, when a user changes their zoom factor on the UI canvas, the frontend sends a dynamic `depth_filter` integer threshold to the backend.

The backend prunes the node array and slides the network wire to the closest visible ancestor in constant time ($O(1)$ complexity per element):

```typescript
function compileTraceForZoom(
  rawNodes: Node[], 
  rawEdges: Edge[], 
  depthFilterThreshold: number
) {
  // 1. Filter out all functions deeper than the requested zoom threshold
  const visibleNodes = rawNodes.filter(node => node.depth_index <= depthFilterThreshold);
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

  // 2. Slide the network lines automatically down the family tree path
  const compiledWires = rawEdges.map(edge => {
    // Scan the breadcrumb trail to find the first parent that is still visible on the screen
    const resolvedFromNodeId = edge.egress_ancestry_path.find(id => visibleNodeIds.has(id));

    return {
      id: edge.id,
      crossing_kind: edge.crossing_kind,
      // If a parent row is visible, snap the line to it; if everything is hidden, snap to the outer Container box
      from_target: resolvedFromNodeId 
        ? { id: resolvedFromNodeId, type: 'node' } 
        : { id: edge.from_container_id, type: 'container' },
      to_target: { id: edge.to_node_id, type: 'node' }
    };
  });

  return { nodes: visibleNodes, wires: compiledWires };
}

```

---

## 6. Visual Layout Specification

The UI takes the backend's pre-calculated payload and plots the rows flatly onto an interactive canvas grid.

```text
[ CONTAINER LANE: web-service ] ────────────────────────────────────────────────────────────
  ● DELETE /tasks/:id       [=====================Processed=====================][=Completed=]
    └── ● controller::foo()     [==========================================]
          └── 📤 kafka::pub           [==============]
                                            │
                                            │ ◄── edge.timestamps.dispatchedAt
                                            │
                                   - - - - -│- - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                            │ ◄── WIRE TRANSIT GAP (Dotted line section)
                                   - - - - -│- - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                            ▼ ◄── edge.timestamps.reachedAt
                                          [███]  ◄── QUEUE LAG BLOCK (Red visual highlight)
                                            ▼ ◄── edge.timestamps.acceptedAt
[ CONTAINER LANE: billing-worker ] ─────────────────────────────────────────────────────────
  └── ● kafka::consume                      [========================================================]

```

### Macro Resolution View (Zoomed Out)

* **Nodes:** The backend filters out all rows where `depth_index > 0`. Containers pack down into small summary blocks.
* **Wires:** The ancestry scan bypasses all hidden child functions and attaches the wire targets generically to the outer physical **Container boundaries**.

### Meso Resolution View (Mid-Zoom)

* **Nodes:** The backend opens the threshold filter slightly (e.g., `depth_index <= 2`). Core business logic components appear, while micro-level helper functions remain hidden.
* **Wires:** The edge re-anchoring engine catches the first visible parent row in the array and **slides the network line down**, anchoring it directly onto that row component.

### Micro Resolution View (Zoomed In)

* **Nodes:** The depth filter drops entirely. The complete internal call tree builds out with diagonal indentation. Sibling rows with overlapping timestamps activate vertical stacking rows to represent concurrent execution.
* **Wires:** Wires drop straight down into the innermost sub-layers of the canvas grid, pinning their coordinates directly to the microsecond pixels of the leaf node rows (e.g., `kafka_publish()`).

---

## 7. Server Infrastructure Stack

* **Ingestion Tier (Go or Rust):** A high-concurrency, stateless server layer. It parses inbound UDP, gRPC, or HTTP POST tracking batches, runs basic schema validation, and fires an immediate `202 Accepted` network response to eliminate profiling latency overhead from production code threads.
* **Transit Tier (Redis):** Incoming out-of-order packets drop into an in-memory sliding hash matched by `trace_id`. The engine sets a temporary staging window TTL (5 to 10 seconds) to collect slow asynchronous packets before flushing the trace down to permanent storage.
* **Analytics Tier (ClickHouse):** A column-oriented database engine. It packs and compresses data strictly by column arrays rather than rows, providing fast storage compression, zero concurrency locks, and sub-millisecond trace reconstructions.

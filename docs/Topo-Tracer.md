# Topo-Tracer: Core Architecture & Data Specification

This document details the core features, architectural primitives, and production data specifications for **Topo-Tracer**—a distributed tracing framework built on graph theory, microsecond-level latency tracking, and an asynchronous, CQRS-backed progressive topology canvas.

---

## 1. Core Features

### A. Multi-Resolution Edge Navigation

Instead of forcing a single rigid view, Topo-Tracer implements a backend-driven **Multi-Resolution** layout system. The engine dynamically groups or stretches code elements based on your viewport magnification.

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

## 4. Production Data Architecture (CQRS Pattern)

The underlying storage layer is segregated into a flat, append-only ingestion engine and a highly indexed, read-optimized materialized closure store to support instant scaling lookups.

### A. Ingestion Tier: Flat Nodes Payload (ClickHouse Write Store)

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

### B. Ingestion Tier: Flat Edges Payload (ClickHouse Write Store)

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

### C. Materialized Tier: Edge Closure Table (Dedicated Read Store)

An asynchronous background worker processes the flat tables above to populate this model, maps the exact structural hopping points per resolution filter, and writes to the read cache.

```json
{
  "id": "closure_edge_001a",
  "edge_id": "edge_cross_wire_331",
  "trace_id": "tx_987654321_kbd",
  "visual_depth_filter": 2,
  "from_target_id": "node_service_bar_12c",
  "from_target_type": "node",
  "to_node_id": "node_worker_consume_002"
}

```

### D. Materialized Tier: Container Layout Bounds (Dedicated Read Store)

Caches layout dimensions for container swimlanes and vertical hierarchy guide lines per resolution layer.

```json
{
  "trace_id": "tx_987654321_kbd",
  "container_id": "con_api_prod_7a81",
  "visual_depth_filter": 2,
  "max_visible_depth": 2,
  "total_visible_rows": 3
}

```

---

## 5. Progressive Capability Toggle & Synchronization

To eliminate heavy runtime graph calculations on the query server, the system enforces a **Progressive Capability Toggle**. Until the asynchronous closure mappings sync entirely, the UI blocks multi-resolution actions and falls back gracefully to standard full-fidelity mode.

### A. Initial Load Payload Contract

The primary transactional application database serves initial metadata and tracking indicators:

```json
{
  "trace_id": "tx_987654321_kbd",
  "is_zoom_ready": false,
  "max_available_depth": 4,
  "containers": [
    { "id": "con_api_prod_7a81", "name": "web-service" }
  ],
  "wires": [
    {
      "id": "edge_cross_wire_331",
      "from_target": { "id": "node_kafka_pub_99a", "type": "node" },
      "to_target": { "id": "node_worker_consume_002", "type": "node" }
    }
  ]
}

```

### B. Resolution Materialization Engine

Once `is_zoom_ready` shifts to `true`, the UI utilizes explicit zoom layer parameters. The query engine serves lookups directly from the read index in constant time ($O(1)$ complexity). A lock-protected mutex fallback guards against cache stampedes:

```typescript
type ResolutionTarget = { id: string; type: 'node' | 'container' };

interface VisualWirePayload {
  id: string;
  from_target: ResolutionTarget;
  to_target: ResolutionTarget;
}

async function fetchWiresForResolution(
  traceId: string,
  depthFilterThreshold: number
): Promise<VisualWirePayload[]> {
  
  // 1. O(1) Fetch from Read Store Closure Tables
  const cachedEdges = await readStore.find({ trace_id: traceId, visual_depth_filter: depthFilterThreshold });
  if (cachedEdges.length > 0) {
    return cachedEdges.map(edge => ({
      id: edge.edge_id,
      from_target: { id: edge.from_target_id, type: edge.from_target_type },
      to_target: { id: edge.to_node_id, type: 'node' }
    }));
  }

  // 2. Mutex-Locked Fallback Routine to Prevent Concurrent Query Stampedes
  return await acquireMutexLock(traceId, async () => {
    const rawNodes = await writeStore.fetchNodes(traceId);
    const rawEdges = await writeStore.fetchEdges(traceId);
    
    const visibleNodes = rawNodes.filter(node => node.depth_index <= depthFilterThreshold);
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    return rawEdges.map(edge => {
      const resolvedFromNodeId = edge.egress_ancestry_path.find(id => visibleNodeIds.has(id));
      return {
        id: edge.id,
        to_target: { id: edge.to_node_id, type: 'node' },
        from_target: resolvedFromNodeId 
          ? { id: resolvedFromNodeId, type: 'node' }
          : { id: edge.from_container_id, type: 'container' }
      };
    });
  });
}

```

---

## 6. Visual Layout Specification

The UI pulls the pre-computed boundaries directly onto an interactive grid tracking structural changes across view resolutions.

```text
[ CONTAINER LANE: web-service ] ────────────────────────────────────────────────────────────
  ● DELETE /tasks/:id       [=====================Processed=====================][=Completed=]
  │  └── ● controller::foo()     [==========================================]
  │        └── 📤 kafka::pub           [==============]
  │                                              │
  │                                              │ ◄── edge.timestamps.dispatchedAt
  │                                              │
  │                                     - - - - -│- - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  │                                              │ ◄── WIRE TRANSIT GAP (Dotted line section)
  │                                     - - - - -│- - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  │                                              ▼ ◄── edge.timestamps.reachedAt
  │                                            [███]  ◄── QUEUE LAG BLOCK (Red visual highlight)
  │                                              ▼ ◄── edge.timestamps.acceptedAt
[ CONTAINER LANE: billing-worker ] ─────────────────────────────────────────────────────────
  └── ● kafka::consume                      [========================================================]

```

### Macro Resolution View (`depthFilterThreshold = 0`)

* **Nodes:** The backend filters out all rows where `depth_index > 0`. Containers pack down into small summary blocks. Vertical indentation lines collapse down to their shortest configuration.
* **Wires:** The closure index specifies `from_target_type: "container"`. Vectors completely ignore nested internal function elements and anchor directly onto outer physical **Container boundaries**.

### Meso Resolution View (`depthFilterThreshold = 2`)

* **Nodes:** The view opens up rows where `depth_index <= 2`. Core business components appear while deep internal leaf helpers remain folded away. The vertical indentation guide lines extend to medium length.
* **Wires:** The read store serves pre-calculated hopping targets. The network wire **slides down the family tree**, entering container boundaries to lock onto the specific visible row component.

### Micro Resolution View (Full Depth / Fallback Default)

* **Nodes:** The threshold boundary is removed. The complete internal call tree maps out with diagonal stepped offsets. Sibling rows with overlapping timestamp marks activate vertical stacking rows to represent concurrent execution. Vertical indentation guidelines extend to maximum length.
* **Wires:** Vectors drive straight through structural wrappers, pinning wire positions directly onto the microsecond execution pixels of individual leaf rows (`kafka_publish()`).

---

## 7. Server Infrastructure Stack

* **Ingestion Tier (Go or Rust):** A high-concurrency, stateless server layer. It parses inbound UDP, gRPC, or HTTP POST tracking batches, runs basic schema validation, and fires an immediate `202 Accepted` network response to eliminate profiling latency overhead from production code threads.
* **Transit Tier (Redis):** Incoming out-of-order packets drop into an in-memory sliding hash matched by `trace_id`. The engine sets a temporary staging window TTL (5 to 10 seconds) to collect slow asynchronous packets before flushing the trace down to permanent storage.
* **Analytics & Read Tier (ClickHouse):** A column-oriented database engine split into flat write-heavy tables and pre-computed read-heavy closure partitions. Storing variables strictly by column arrays permits high storage data compression, zero transaction locking mechanisms, and sub-millisecond trace reconstructions.

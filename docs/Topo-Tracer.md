# Topo-Tracer: Core Architecture & Data Specification

This document details the core features, architectural primitives, and production data specifications for **Topo-Tracer**—a distributed tracing framework built on graph theory, microsecond-level latency tracking, and an asynchronous, CQRS-backed progressive topology canvas.

> Implementation note: current backend code lives in `carno.js/src` and uses ClickHouse database `toco_tracer`. The implemented read cache is `read_edges` plus `trace_metadata`; container layout bounds remain a proposed UI/read-model feature.

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

* `initiatedAtLocal`: When the function block starts running locally.
* `processedAtLocal`: When the core internal calculation logic finishes.
* `completedAtLocal`: When the function completely wraps up.

### Edge Timestamps (Network & Transport Performance)

* `dispatchedAtLocal`: When the serialized data leaves the sender's network card or memory buffer.
* `respondedAtLocal`: When the caller receives the response back from the network.

### The Calculus

$$\begin{aligned}
\mathbf{Total\ Network\ Turnaround\ (RTT)} &\quad=\quad \text{edge.respondedAtLocal} - \text{edge.dispatchedAtLocal} \
&\quad\quad\quad \textit{(Exposes full network transit and downstream processing latency)} \
\mathbf{Pure\ Processing\ Time} &\quad=\quad \text{node.processedAtLocal} - \text{node.initiatedAtLocal} \
&\quad\quad\quad \textit{(Isolates execution time spent inside the actual application logic)} \
\mathbf{Callback\ Cascade\ Delay} &\quad=\quad \text{node.completedAtLocal} - \text{node.processedAtLocal} \
&\quad\quad\quad \textit{(Exposes time spent waiting for nested child hierarchies to unwind)}
\end{aligned}$$

---

## 4. Production Data Architecture (CQRS Pattern)

The underlying storage layer is segregated into a flat, append-only ingestion engine and a highly indexed, read-optimized materialized closure store to support instant scaling lookups.

### A. Ingestion Tier: Flat Nodes Payload (ClickHouse Write Store)

```json
{
  "id": "node_kafka_pub_99a",
  "traceId": "tx_987654321_kbd",
  "containerId": "con_api_prod_7a81",
  "parentNodeId": "node_controller_foo_44b",
  "depthIndex": 4,
  "nodeType": "publish",
  "name": "kafka::publish_event",
  "metadata": "{\"topic\":\"task.events\",\"payload_bytes\":512}",
  "initiatedAtLocal": 1779905412010200,
  "processedAtLocal": 1779905412015100,
  "completedAtLocal": 1779905412015200
}
```

### B. Ingestion Tier: Flat Edges Payload (ClickHouse Write Store)

```json
{
  "id": "edge_cross_wire_331",
  "traceId": "tx_987654321_kbd",
  "fromContainerId": "con_api_prod_7a81",
  "toContainerId": "con_worker_prod_11b2",
  "fromNodeId": "node_kafka_pub_99a",
  "toNodeId": "node_worker_consume_002",
  "egressAncestryPath": [
    "node_kafka_pub_99a",
    "node_func_b_33a",
    "node_service_bar_12c",
    "node_controller_foo_44b"
  ],
  "edgeType": "queue",
  "dispatchedAtLocal": 1779905412015150,
  "respondedAtLocal": 1779905412015186
}
```

### C. Materialized Tier: Edge Closure Table (Dedicated Read Store)

An asynchronous background worker processes the flat tables above to populate this model, maps the exact structural hopping points per resolution filter, and writes to the read cache.

```json
{
  "id": "closure_edge_001a",
  "edge_id": "edge_cross_wire_331",
  "trace_id": "tx_987654321_kbd",
  "depth_type": "global",
  "visual_depth": 2,
  "from_target_id": "node_service_bar_12c",
  "from_target_type": "node",
  "to_target_id": "node_worker_consume_002",
  "to_target_type": "node"
}

```

### D. Proposed Tier: Container Layout Bounds (Not Implemented)

Container layout bounds would cache swimlane heights and vertical hierarchy guide lines per resolution layer. Current backend does not create this table; UI code must derive layout from returned nodes, edges, `visualWires`, and `trace_metadata`.

```json
{
  "trace_id": "tx_987654321_kbd",
  "container_id": "con_api_prod_7a81",
  "visual_depth": 2,
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

Once `is_zoom_ready` shifts to `true`, the UI utilizes explicit zoom layer parameters. The query engine serves lookups directly from the sparse `read_edges` index:

```typescript
type ResolutionTarget = { id: string; type: 'node' | 'container' };

interface VisualWirePayload {
  id: string;
  from_target: ResolutionTarget;
  to_target: ResolutionTarget;
}

async function fetchWiresForResolution(
  traceId: string,
  depth: number,
  depthType: 'global' | 'local'
): Promise<VisualWirePayload[]> {
  const rows = await readStore.query(`
    SELECT *
    FROM toco_tracer.read_edges
    WHERE trace_id = {traceId: String}
      AND depth_type = {depthType: String}
      AND visual_depth <= {depth: UInt32}
    ORDER BY visual_depth DESC
    LIMIT 1 BY edge_id
  `, { traceId, depthType, depth });

  return rows.map(edge => ({
    id: edge.edge_id,
    from_target: { id: edge.from_target_id, type: edge.from_target_type },
    to_target: { id: edge.to_target_id, type: edge.to_target_type }
  }));
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

* **Ingestion Tier (Node.js & `@carno.js/core`):** A high-concurrency, stateless TypeScript server layer. It exposes REST endpoints (`LogController`) to receive tracking batches and validates payloads.
* **Storage & Analytics Tier (ClickHouse):** A column-oriented database engine split into flat write-heavy tables (`nodes`, `edges`) and pre-computed read-heavy cache tables (`node_ancestry`, `read_edges`). Storing variables strictly by column arrays permits high data compression and zero transaction locking mechanisms.
* **Background Materialization Worker (In-Memory Broker):** An asynchronous event-driven worker built on an `InMemoryMessageBroker` (simulating SQS/Kafka locally). As soon as raw logs hit ClickHouse, it iteratively processes missing parent ancestries and computes deep cross-container visual wires without blocking the HTTP ingestion endpoints.

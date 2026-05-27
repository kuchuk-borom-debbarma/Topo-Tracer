# Carno.js Trace Materialization Engine: Multi-Resolution Zoom

When dealing with large-scale distributed architectures, visualizing a raw execution trace presents a massive UX challenge: **The Wall of Spaghetti**. If a client request triggers 5,000 tiny internal function calls across 15 microservices, attempting to render every single node and network wire simultaneously freezes the browser and provides no actionable context to the developer.

**Multi-Resolution Zoom** solves this by treating your system trace like an interactive map. When zoomed out, microscopic framework functions vanish, and the UI displays broad infrastructure containers. As the user zooms in, the system unpacks deeply nested logical operations.

This document details the exact end-to-end mechanics of the **Trace Materialization Engine** inside `carno.js` that makes this $O(1)$ visual rendering possible.

---

## 1. The Core Architecture (CQRS)

Rendering dynamically collapsing trace lines on the fly via massive SQL `JOIN`s would instantly lock up the database. Instead, `carno.js` employs a **Command Query Responsibility Segregation (CQRS)** pattern:

1. **Write-Optimized Path:** The telemetry ingress APIs (`POST /telemetry/*`) do *zero* calculations. They instantly append the flat rows to ClickHouse's `nodes` and `edges` tables, enabling millions of writes per second.
2. **Read-Optimized Path (Materialization):** An asynchronous `MessageBroker` delegates the complex hierarchy calculations to background operator loops. These operators compute exactly how the lines should visually collapse and write the sparse results to a highly optimized `read_edges` table.
3. **The Fetch Request:** When the UI requests a zoomed layout, it hits the `read_edges` table for an instant $O(1)$ coordinate lookup.

---

## 2. The Dual-Depth Dimensions

Before diving into the pipeline, it's critical to understand that `carno.js` computes zoom closures across **two independent dimensions simultaneously**:

* **Global Depth (`depth_type: 'global'`):** Represents the absolute nesting level starting from the very first entrypoint of the entire trace. Zooming out on this scale collapses deep downstream containers entirely into opaque boxes, providing a **Macro Infrastructure Map**.
* **Local Depth (`depth_type: 'local'`):** Resets to `0` at the root entrypoint of *every single container*. Zooming out to `0` on this scale exposes the absolute highest-level handler (e.g., `POST /v1/checkout` or `Consume Kafka Event`) for every service, providing a direct **API Blueprint Map** connecting microservices endpoint-to-endpoint.

---

## 3. Data Transformation Walkthrough

Let's trace a real example through the background Materialization Engine to see how the raw data morphs.

### Step A: Raw Ingestion (The Write DB)
Assume `Container A` (a web service) calls `Container B` (a worker) via a Kafka message. The SDK streams the following raw nodes into the ClickHouse `nodes` table:

| ID | Name | Parent ID | Global Depth (`depthIndex`) | Local Depth (`localDepthIndex`) |
|---|---|---|---|---|
| `N1` | `POST /api` | `root` | 0 | 0 |
| `N2` | `dispatch()` | `N1` | 1 | 1 |
| `N3` | `Kafka Pub` | `N2` | 2 | 2 |
| `N4` | `Kafka Sub` | `N3` *(via edge)* | 3 | 0 |
| `N5` | `process()` | `N4` | 4 | 1 |

*Note: The raw network edge `E1` connects `N3` directly to `N4`.*

### Step B: The Node & Edge Resolvers (Parallel Arrays)
When the background materializer boots up, `TraceNodeResolver` flattens the execution tree. To prevent recursive database lookups later, it builds **Parallel Ancestry Arrays** and caches them in the `node_ancestry` table.

For the egress node `N3` (where the network edge leaves Container A), the `TraceEdgeResolver` caches the following parallel arrays onto the edge itself:
```json
{
  "edge_id": "E1",
  "egressAncestryPath": ["N1", "N2", "N3"],
  "egressAncestryDepths": [0, 1, 2],
  "egressAncestryLocalDepths": [0, 1, 2]
}
```

### Step C: The Closure Builder (Dynamic Snap Anchors)
The `TraceClosureBuilder` is the magic engine. It iterates through every possible UI zoom depth (`d = 0, 1, 2...`) for both `global` and `local` arrays. 

For each depth `d`, it loops *backwards* through the parallel arrays and asks: **"What is the deepest node whose absolute nesting depth is `<=` the current visual limit?"**

*If a node is found, the network wire snaps to that exact node.*
*If NO node is found (i.e., the entire branch is hidden), the wire safely degrades and snaps to the outer Container boundary.*

#### **Calculating Global Wires (Macro Map):**
* **At `d = 0`:** Searches `[0, 1, 2]` for `<= 0`. Finds `N1`. The ingress container (`N4` which is depth 3) finds nothing `<= 0`.
  * **Resulting Wire:** `N1` ➔ `Container B (Collapsed)`
* **At `d = 1`:** Searches `[0, 1, 2]` for `<= 1`. Finds `N2`. 
  * **Resulting Wire:** `N2` ➔ `Container B (Collapsed)`
* **At `d = 3`:** Searches egress `[0,1,2]` finds `N3`. Searches ingress `[3]` for `<=3`, finds `N4`.
  * **Resulting Wire:** `N3` ➔ `N4` (Full Fidelity)

#### **Calculating Local Wires (API Map):**
* **At `d = 0`:** Searches `localDepths [0, 1, 2]` for `<= 0`. Finds `N1`. Searches ingress `localDepths [0]` for `<= 0`, finds `N4`.
  * **Resulting Wire:** `N1` ➔ `N4` *(Direct API-to-API view!)*

---

## 4. Sparse Caching Optimization

Writing a unique row for every single visual depth integer (e.g. 0 to 50) would bloat the `read_edges` table linearly. To optimize this, the `TraceClosureBuilder` uses **Sparse Array Caching**. 

It only inserts a new row into the database when the computed snap targets *actually change*. 

The final `read_edges` table for this edge looks like this:

| Edge ID | Depth Type | Visual Depth | From Target | To Target |
|---|---|---|---|---|
| `E1` | `global` | `0` | `N1` | `Container B` |
| `E1` | `global` | `1` | `N2` | `Container B` |
| `E1` | `global` | `2` | `N3` | `Container B` |
| `E1` | `global` | `3` | `N3` | `N4` |
| `E1` | `local` | `0` | `N1` | `N4` |
| `E1` | `local` | `1` | `N2` | `N4` |
| `E1` | `local` | `2` | `N3` | `N4` |

*Notice that visual depths like `4` or `25` are missing because the targets stopped changing after `3` and `2`.*

---

## 5. The UI Fetch Protocol

When the frontend zooms the canvas to `Depth 2 (Local Mode)`, it makes a simple paginated request to the query server:

`GET /telemetry/trace/trace_123?depth=2&depthType=local`

The `LogController` passes this directly to ClickHouse. Because the backend has fully pre-computed the coordinates, the database query executes a lightning-fast $O(1)$ match:

```sql
SELECT * FROM toco_tracer.read_edges
WHERE trace_id = 'trace_123' 
  AND depth_type = 'local' 
  AND visual_depth <= 2
ORDER BY visual_depth DESC
LIMIT 1 BY edge_id
```

The `< d ORDER BY DESC LIMIT 1` clause acts as a sparse array lookup. It grabs the exact bounding row immediately below or equal to the UI's zoom threshold. The backend returns these perfectly snapped layout coordinates instantly, and the UI draws the vector wire without executing a single DOM or tree-traversal calculation!

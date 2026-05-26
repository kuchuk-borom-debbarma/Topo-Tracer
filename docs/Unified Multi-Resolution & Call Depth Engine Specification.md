# Topo-Tracer: Unified Multi-Resolution & Call Depth Engine Specification

This document details the layout mechanics and backend compilation rules that govern how **Call Depth** and **Multi-Resolution Zoom** work together.

Specifically, it addresses how the system computes the varying vertical heights (longer or shorter vertical indentation guide lines) of container lanes on the canvas using pre-calculated depth summaries stored directly in the read-optimized closure tables.

---

## 1. What is the Unified Zoom Engine?

In a distributed infrastructure map, call depth inside a process and multi-resolution edge connections across network boundaries are two sides of the same coin. Topo-Tracer merges them by using the **Generational Index (`depth_index`)** as a single sliding cutoff point.

When a user scrolls the zoom wheel, the architecture updates three visual coordinates simultaneously:

1. **The Row Count:** The backend slices away any code rows sitting deeper than the active zoom threshold.
2. **The Wire Anchor:** The cross-container edge components instantly slide up or down their recorded breadcrumb paths (`egress_ancestry_path`) to stay pinned to the deepest *visible* parent row.
3. **The Guide Lines:** The vertical indentation guide lines—and the height boundaries of the container swimlanes themselves—grow longer or shorter dynamically based on the **maximum active depth** allowed by that resolution slice.

---

## 2. A Real-World Integrated Trace Example

Consider a distributed system execution trace where `web-service` executes a nested stack, then fires a background event to `billing-worker`:

```text
[Container A: web-service]
├── [depth_index: 0]  DELETE /tasks/:id (Root HTTP Ingress)
│                       └── [depth_index: 1]  auth_middleware()
│                                               └── [depth_index: 2]  TaskController() (Domain Core)
│                                                                       └── [depth_index: 3]  SendKafkaNotification()
│                                                                                               │
│                                                                                        (Transport Wire)
│                                                                                               │
│                                                                                               ▼
│                                                                                   [Container B: billing-worker]
│                                                                                   └── [depth_index: 0] kafka::consume

```

---

## 3. Database & System Architecture

To calculate how long or short a container's vertical track layout should be without running expensive loops at query time, the background sync worker calculates the **`max_visible_depth`** for every single resolution step and caches it directly into the read-optimized closure database.

### The Read-Optimized Trace Layout Properties

Every layout entry maps the exact spatial scope of a container at a specific zoom milestone, allowing immediate $O(1)$ query lookups:

```typescript
interface ClosureContainerLayout {
  id: string;
  trace_id: string;
  container_id: string;
  visual_depth_filter: number; // The current viewport zoom threshold
  max_visible_depth: number;   // Dictates lane height and vertical guide line lengths
  total_visible_rows: number;  // Used by the canvas grid engine to space peer swimlanes
}

```

---

## 4. Production Data Payload

When the background worker builds the closure tables for our example trace, it outputs a flat matrix mapping the physical boundaries of the containers across all zoom levels:

```json
[
  {
    "trace_id": "tx_987654321_kbd",
    "container_id": "con_api_prod_7a81",
    "visual_depth_filter": 0,
    "max_visible_depth": 0,
    "total_visible_rows": 1
  },
  {
    "trace_id": "tx_987654321_kbd",
    "container_id": "con_api_prod_7a81",
    "visual_depth_filter": 2,
    "max_visible_depth": 2,
    "total_visible_rows": 3
  },
  {
    "trace_id": "tx_987654321_kbd",
    "container_id": "con_api_prod_7a81",
    "visual_depth_filter": 4,
    "max_visible_depth": 3,
    "total_visible_rows": 4
  }
]

```

---

## 5. Visual Layout Specification Transitions

The UI layout manager takes these pre-calculated integers and scales the physical container boxes and tree line components seamlessly across the three operational view resolutions.

### Macro Mode Layout (`depthFilterThreshold = 0`)

* **Container Indentation Length:** The backend returns `max_visible_depth: 0`. The internal code tree inside `web-service` vanishes. The vertical indentation guide lines collapse down to their **shortest possible length** (completely hidden). The container area condenses into a clean, single-row infrastructure block card.
* **The Wiring:** The wire engine reads the edge ancestry path, sees that rows 3, 2, and 1 are squashed, and routes the cross-service wire generically from the outer physical boundary of the `web-service` card straight to the `billing-worker` card.

### Meso Mode Layout (`depthFilterThreshold = 2`)

* **Container Indentation Length:** The backend serves the cached metrics: `max_visible_depth: 2` and `total_visible_rows: 3`. The `web-service` swimlane scales its height downward to clear vertical room. The vertical indentation guide lines **stretch out to a medium length**, cleanly cascading from the root request down through `auth_middleware()` and anchoring onto `TaskController()`.
* **The Wiring:** The edge re-anchoring logic scans the edge breadcrumbs and finds that row `2` (`TaskController`) is now active on the screen. The network wire **slides down the family tree**, dropping inside the container margins to anchor onto the `TaskController()` row component.

### Micro Mode Layout (Full Depth / Fallback Default)

This is the system's unrestricted path view, used while data sync loops finish.

* **Container Indentation Length:** All filters drop. The backend serves the absolute maximum call depth metrics. The container box expands to its **maximum calculated vertical height**, and the vertical indentation guide lines stretch out to their **longest possible configuration**, mapping out the entire cascading frame path down to row depth `3`.
* **The Wiring:** The wire calculations loop bypasses all structural abstractions and pins the connection line straight onto the microsecond execution pixels of the deepest leaf row (`SendKafkaNotification()`).

```text
[ CONTAINER LANE: web-service ] ────────────────────────────────────────────────────────────
  ● DELETE /tasks/:id       [=================================================]
    │  └── ● auth_middleware       [================]
    │        └── ● TaskController      [====================================================]
    │              └── 📤 kafka::pub         [============]
    │                                             │
    │                                             │ ◄── Wires snap to longest path row pixels
    ▼ ◄── Indentation guide lines stretch         ▼
[ CONTAINER LANE: billing-worker ] ─────────────────────────────────────────────────────────
  └── ● kafka::consume                      [========================================================]

```

---

## 6. Performance Benefits

* **Zero Frontend Computation:** The frontend never has to guess how tall a container swimlane should be, nor does it need to trace parent paths recursively to calculate vertical line heights. The backend pre-computes the physical boundaries of the graph blueprint upfront.
* **Jitter-Free Scaling:** Because the heights, rows, and wire targets are delivered in a single atomic payload matching the user's zoom factor, the canvas transitions instantly. Lines don't drift or tear away from rows during zoom shifts because the spatial boundaries are locked on the backend.

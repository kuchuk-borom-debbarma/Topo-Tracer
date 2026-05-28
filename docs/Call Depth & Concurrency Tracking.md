# Topo-Tracer: Call Depth & Concurrency Tracking Specification

This document details the core design, database architecture, and backend layout rules for tracking internal call stacks and asynchronous concurrency within the Topo-Tracer ecosystem.

---

## 1. What is Call Depth & Concurrency Tracking?

In highly asynchronous or event-driven backend systems, tracking the execution flow inside a single machine is just as critical as tracking network crossings between separate servers. Traditional tracing tools dump everything into a flat timeline, making it difficult to instantly distinguish between synchronous blocking code and parallel async operations.

**Call Depth & Concurrency Tracking** solves this by converting flat, local trace data into a multi-dimensional structural tree based on two simple concepts:

* **The `depth_index` (Vertical Hierarchy):** An integer that maps exactly how many layers deep a piece of code is running relative to the initial entry boundary.
* **Concurrency Stacking (Horizontal Overlap):** A layout rule that identifies functions running simultaneously. Instead of stepping deeper diagonally, concurrent tracks freeze indentation and stack vertically to map parallel behavior cleanly.

---

## 2. A Real-World Execution Trace Example

Consider a scenario inside a task management application where an incoming HTTP request triggers an authorization middleware check, followed by a controller block that launches two database queries simultaneously using a parallel processing block (like `Promise.all`):

```typescript
async function handleTaskRequest(req, res) {
  // [depth_index: 0] Ingress Entry Point
  await topo.trace("HTTP DELETE /tasks/:id", async () => {
    
    // [depth_index: 1] Middleware Interceptor
    await topo.trace("auth_middleware", async () => {
      
      // [depth_index: 2] Core Domain Controller
      await topo.trace("TaskController", async () => {
        
        // [depth_index: 3] Concurrent Execution Block
        await Promise.all([
          topo.trace("db::fetch_user", () => pool.query()), // Row Track A
          topo.trace("db::fetch_task", () => pool.query())  // Row Track B
        ]);
        
      });
    });
  });
}

```

---

## 3. Database & System Architecture

To keep write performance incredibly high, the Topo-SDK does not build or nest complex tree documents in application memory. It records the local call hierarchy by stamping each execution frame with flat tracking pointers before flushing it to our append-only store (ClickHouse).

### The Inbound Schema Properties

Every node payload carries its location context via two flat data coordinates:

1. **`parent_node_id`:** A reference linking the function to its immediate parent frame (null if it is the root ingress entry point).
2. **`depth_index`:** A simple integer counter that ticks up by 1 every time an active execution scope drops down into a sub-step.

---

## 4. Production Data Payload

When the transaction finishes, the SDK flushes the telemetry rows to the database completely flat, requiring no locking mechanisms or document-stitching loops:

```json
[
  {
    "id": "node_http_root_001",
    "parentNodeId": null,
    "depthIndex": 0,
    "name": "HTTP DELETE /tasks/:id",
    "timestamps": { "initiatedAt": 1779905412000, "processedAt": 1779905412050, "completedAt": 1779905412050 }
  },
  {
    "id": "node_auth_002",
    "parentNodeId": "node_http_root_001",
    "depthIndex": 1,
    "name": "auth_middleware",
    "timestamps": { "initiatedAt": 1779905412002, "processedAt": 1779905412010, "completedAt": 1779905412010 }
  },
  {
    "id": "node_ctrl_003",
    "parentNodeId": "node_auth_002",
    "depthIndex": 2,
    "name": "TaskController",
    "timestamps": { "initiatedAt": 1779905412011, "processedAt": 1779905412048, "completedAt": 1779905412049 }
  },
  {
    "id": "node_db_user_004",
    "parentNodeId": "node_ctrl_003",
    "depthIndex": 3,
    "name": "db::fetch_user",
    "timestamps": { "initiatedAt": 1779905412012, "processedAt": 1779905412030, "completedAt": 1779905412030 }
  },
  {
    "id": "node_db_task_005",
    "parentNodeId": "node_ctrl_003",
    "depthIndex": 3,
    "name": "db::fetch_task",
    "timestamps": { "initiatedAt": 1779905412013, "processedAt": 1779905412045, "completedAt": 1779905412045 }
  }
]
````

---

## 5. Visual Layout Specification Transitions

When the UI canvas materializes this flat data array into a visual chart, it iterates through the elements and uses specific geometric layout rules to plot rows along the X (time) and Y (depth) coordinate fields.

### Sequential Step Layout (Diagonal Indentation)

If a node’s `parent_node_id` matches the preceding node's tracking ID, the layout manager applies a fixed horizontal offset (e.g., `24px` left padding). This builds a clean, cascading diagonal stair-step pattern that signals blocked, synchronous execution sequences.

### Parallel Track Layout (Stacked Concurrency)

When the layout engine encounters sibling nodes that share the exact same `parent_node_id` and have matching `depth_index` numbers (such as `node_db_user_004` and `node_db_task_005`), **horizontal diagonal indentation is frozen**.

* **The Sizing:** The engine stops the diagonal stair-step cascade. It stacks the peer nodes vertically on top of each other on separate, parallel coordinate rows.
* **The Positioning:** Both tracks are forced to line up at the exact same horizontal indentation layer. This tells the developer instantly that these items ran in parallel via asynchronous loops rather than waiting for each other to finish.

```text
[ CONTAINER LANE: web-service ] ────────────────────────────────────────────────────────────
  ● DELETE /tasks/:id       [=================================================]
    └── ● auth_middleware       [================]
          └── ● TaskController      [====================================================]
                ├── ⚡ db::fetch_user     [==================]
                └── ⚡ db::fetch_task     [=======================================]

```

---

## 6. Performance Benefits

* **Instant Async Diagnostics:** Developers can look at the blueprint canvas and immediately pinpoint thread performance. Async groupings stack up vertically, while sequential, thread-blocking dependencies step down diagonally.
* **Scroll Fatigue Elimination:** Traditional timelines waterfall infinitely downwards and to the right, forcing intense scrolling on deep call stacks. By squashing parallel loops and stacking them tightly on matching horizontal lanes, the canvas space remains perfectly compact, readable, and lightning-fast to navigate.

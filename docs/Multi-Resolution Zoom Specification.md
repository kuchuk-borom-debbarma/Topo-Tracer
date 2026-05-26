# Topo-Tracer: Multi-Resolution Zoom Specification

This document details the core design, database architecture, and backend implementation patterns for **Multi-Resolution Zoom** within the Topo-Tracer ecosystem utilizing a CQRS (Command Query Responsibility Segregation) and Closure Table model.

---

## 1. What is Multi-Resolution Zoom?

In large-scale distributed architectures, debugging speed is ruined by the **"Wall of Fire"** problem—dashboard software dumping thousands of unorganized, microscopic function call bars onto a timeline layout all at once.

**Multi-Resolution Zoom** fixes this by converting raw, flat trace outputs into an elastic, structural system map. Instead of a static timeline tracking fixed milestones, the visual graph operates like a modern map interface.

* **Zoomed Out (Macro Mode):** Detailed code operations are hidden. The view shows only physical infrastructure lanes and high-level service connectivity metrics.
* **Zoomed In (Micro Mode):** The system continuously strips away high-level abstractions, unpacking deeply nested functional call stacks and driving network line connections straight to the precise millisecond of code execution where data broke out of the thread.

---

## 2. A Real-World Execution Trace Example

Consider a distributed sequence where a client fires a request to a service, processing code through multiple software layers before pushing an event out to an external broker:

```text
[Container A: web-service]
└── [depth_index: 0]  DELETE /tasks/:id (Root HTTP Route)
                        └── [depth_index: 1]  auth_middleware()
                                                └── [depth_index: 2]  TaskController()
                                                                        └── [depth_index: 3]  SaveToDatabase()
                                                                                                └── [depth_index: 4]  SendKafkaNotification()
                                                                                                                        │
                                                                                                                 (Transport Wire)
                                                                                                                        │
                                                                                                                        ▼
                                                                                                            [Container B: message-broker]
                                                                                                            └── [depth_index: 0] kafka::consume

```

---

## 3. Database & System Architecture (CQRS Pattern)

To achieve maximum write throughput during telemetry ingestion while keeping frontend queries lightning fast, Topo-Tracer splits its data architecture into two independent, decoupled storage zones:

1. **Write-Optimized Store (ClickHouse):** Telemetry packets are streamed and appended completely flat, capturing rows with standard `depth_index` and call stack pointers.
2. **Read-Optimized Store (Closure Cache Tables):** An asynchronous background pipeline processes the flat traces and expands every single cross-container edge connection into pre-computed, multi-resolution "hopping points" for every possible visual depth layer.

### The Materialized Closure Edge Schema

For every inter-container connection, the read-optimized store caches rows mapped directly to explicit UI depth parameters, allowing immediate $O(1)$ query lookups:

```typescript
interface MaterializedClosureEdge {
  id: string;                    // Unique identifier for this resolution row
  edge_id: string;               // Underlying physical edge tracking ID
  trace_id: string;
  visual_depth: number;          // The UI depth threshold where this row is active
  from_target_id: string;        // Pre-computed visual origin ID
  from_target_type: 'node' | 'container';
  to_node_id: string;            // Direct ingress row on destination container
}

```

---

## 4. Progressive Capability Toggle (Sync Lifecycle)

To protect the database from heavy runtime calculations, the platform implements a **Progressive Capability Toggle**. Until the background worker completes processing the closure rows for a trace, the frontend is restricted from using the zoom slider and defaults to full-fidelity mode.

```text
[ Telemetry Ingestion ] ──> [ Flat Write DB ] ──> [ UI Initial Load: Deepest Version Only ]
                                                        │ (is_zoom_ready: false)
                                                        ▼
                                            [ Async Async Background Worker ]
                                                        │ (Computes Hopping Points)
                                                        ▼
                                            [ Read-Optimized Closure Table ]
                                                        │ (is_zoom_ready: true)
                                                        ▼
                                            [ UI Slide Controls Activate ]

```

### The Initialization Payload Contract

When a trace is first loaded, the query server drops the flat lines and injects synchronization metadata tokens:

```json
{
  "trace_id": "tx_987654321_kbd",
  "is_zoom_ready": false,
  "max_available_depth": 4,
  "containers": [
    { "id": "c_web", "name": "web-service" }
  ],
  "wires": [
    {
      "id": "e_wire",
      "from_target": { "id": "node_kafka_pub_4", "type": "node" },
      "to_target": { "id": "node_worker_consume_0", "type": "node" }
    }
  ]
}

```

---

## 5. Backend Query Materialization Engine

Once `is_zoom_ready` toggles to `true`, the user interfaces can pass explicit zoom layer thresholds. The query service handles this via zero-computation indexing lookups straight from the cached read store.

If a cache miss occurs before processing finishes, the backend falls back to calculating anchors dynamically using a mutex cache-lock to prevent stampedes:

```typescript
type ResolutionTarget = { id: string; type: 'node' | 'container' };

interface OptimizedEdgePayload {
  id: string;
  from_target: ResolutionTarget;
  to_target: ResolutionTarget;
}

async function getTraceWiresForResolution(
  traceId: string,
  depthFilterThreshold: number
): Promise<OptimizedEdgePayload[]> {
  
  // 1. Direct O(1) optimized index fetch from the Read Store
  const cachedEdges = await readDatabase.find({ trace_id: traceId, visual_depth: depthFilterThreshold });
  if (cachedEdges.length > 0) {
    return cachedEdges.map(edge => ({
      id: edge.edge_id,
      from_target: { id: edge.from_target_id, type: edge.from_target_type },
      to_target: { id: edge.to_node_id, type: 'node' }
    }));
  }

  // 2. Lock-Protected Fallback Routine (Prevents Concurrent Query Stampedes)
  return await acquireMutexLock(traceId, async () => {
    const rawNodes = await writeDatabase.fetchNodes(traceId);
    const rawEdges = await writeDatabase.fetchEdges(traceId);
    
    // Compute closures dynamically and write through to the Read Store cache
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

## 6. Visual Layout Specification Transitions

The user interface consumes the pre-computed backend target parameters to switch vector snap coordinates instantly during viewport scaling passes:

### Macro Mode Layout (`depthFilterThreshold = 0`)

The client can access this mode only when `is_zoom_ready` is verified true.

* **The Sizing:** Internal container code paths drop completely out of sight. Containers collapse into compact infrastructure blocks whose layout width tracks total running duration.
* **The Wiring:** The read store serves pre-calculated `from_target_type: "container"` fields. Wires ignore hidden internal lines and snap directly to the outer envelope boundaries of the Container box components.

### Meso Mode Layout (`depthFilterThreshold = 2`)

The user zooms in one increment to view application domain blocks.

* **The Sizing:** The lane expands downwards to clear layout coordinates for `DELETE /tasks/:id` and `TaskController()`. Utility framework methods stay hidden.
* **The Wiring:** The backend delivers records matching `visual_depth: 2`. The wire path instantly drops past hidden child fields and anchors straight onto the `TaskController()` row component.

### Micro Mode Layout (Full Depth / Fallback Default)

This is the system's unrestricted path view, and the mandatory layout state used while data sync loops finish.

* **The Sizing:** The container canvas layout fully unwinds vertically. Overlapping peer elements freeze horizontal diagonal stepped layouts and stack rows vertically to group concurrent processing steps.
* **The Wiring:** Connection vectors dive through the outermost container envelopes, pinning line coordinates onto individual leaf row components (`SendKafkaNotification()`). Wires resolve layouts flatly via native CSS transforms without executing runtime traversal scripts.

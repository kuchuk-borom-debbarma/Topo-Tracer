# Topo-Tracer Node.js SDK Developer Usage Guide

The Topo-Tracer Node.js SDK provides lightweight, high-performance distributed tracing instrumentation. It maps code execution paths cleanly to the backend **Dynamic Zooming and Layout Engine** using an append-only event-driven telemetry model. 

Instead of traditional flat span trace-stacks, it automatically derives:
*   **Blocks (X-Coordinate):** Horizontal structural parentage and function nesting depth.
*   **Nodes (Y-Coordinate):** Chronological, sequential checkpoint card stacks within blocks.
*   **Edges (Visual Wires):** Curves representing network hops and asynchronous control handoffs.

---

## 1. Initialization

Call `Tracer.init()` exactly once when your Node.js application boots. This configures the backend connection parameters and registers the process container.

```typescript
import { Tracer, ContainerType } from "@topo-tracer/sdk";

Tracer.init(
  {
    baseUrl: "http://localhost:3000", // Carno.js backend server
    batchSize: 100,                  // Flush batches to backend when this size is hit
    flushIntervalMs: 2000            // Periodically flush remaining events every 2 seconds
  },
  {
    id: "container-order-api",
    name: "Order API Gateway",
    containerType: ContainerType.EXPRESS_API // Semantic type for beautiful styling
  }
);
```

---

## 2. Tracing Ingress/Root Transactions

When a request enters your system (e.g., an HTTP request in your API gateway), start a new distributed trace.

```typescript
import { Tracer, NodeType } from "@topo-tracer/sdk";

// Start a root block representing the entry boundary
const rootNode = Tracer.startTrace("POST /v1/orders", NodeType.HTTP_SERVER);

try {
  rootNode.markProcessed(); // Signal that waiting/queue time is over and processing has begun
  
  // Your core execution logic goes here...
  
  rootNode.markCompleted({ status: 201, orderId: 999 }); // Pair the lifecycle and close
} catch (error: any) {
  rootNode.markCompleted({ error: true, message: error.message });
  throw error;
}
```

---

## 3. Nested Operations & Spawning Blocks

To capture nested function blocks, sequential execution flows, and helper boundaries inside the same container, spawn children using `startChild`.

This automatically logs:
1. A parent calling node checkpoint in the parent block.
2. A new nested child execution block to the right.
3. An entry node event inside that child block.
4. A curved jump wire from the parent block's calling card to the child block.

```typescript
// Spawn a nested validation scope block
const validationBlock = rootNode.startChild("validateOrder()", NodeType.FUNCTION);

try {
  validationBlock.markProcessed();
  
  // 3.1 Point milestones inside a block (Y-axis flow stack)
  // For simple points or sub-queries that don't need a separate block card, 
  // you can log them using the exact same structure!
  const dbQuery = validationBlock.startChild("DB: Fetch User", NodeType.DATABASE);
  dbQuery.markProcessed();
  await fetchUser(userId);
  dbQuery.markCompleted({ rowsFetched: 1 });
  
  validationBlock.markCompleted({ valid: true });
} catch (error) {
  validationBlock.markCompleted({ valid: false });
}
```

---

## 4. Multi-Service Context Propagation (Cross-Container Boundaries)

When making a call to a downstream microservice (such as over HTTP or gRPC), you should pass context headers and spawn a child node across container boundaries.

### Outgoing Egress Call (Upstream Service)
Using `startChildInContainer` automatically generates egress calling nodes and wire edges to downstream containers, saving boilerplate code:

```typescript
const paymentServiceId = "container-payment-svc";

// Start a child node inside the downstream service container
const paymentClientBlock = rootNode.startChildInContainer({
  containerId: paymentServiceId,
  containerName: "Payment Processor Service",
  containerType: ContainerType.GRPC_SERVICE,
  name: "HTTP POST /payments/charge",
  nodeType: NodeType.HTTP_CLIENT
});

// Inject tracing headers into the HTTP payload
const outgoingHeaders = {
  "x-trace-id": paymentClientBlock.traceId,
  "x-parent-node-id": paymentClientBlock.parentNodeId, // The upstream caller node
  "x-target-node-id": paymentClientBlock.id,            // The downstream entry node
  "x-depth-index": paymentClientBlock.depthIndex.toString(),
};

// ... Send HTTP Request with headers to downstream ...

// Once HTTP call returns, close the block context
paymentClientBlock.markCompleted({ status: 200 });
```

### Incoming Ingress Continuation (Downstream Service)
On the receiving end of the downstream service, extract headers and continue the active trace using `Tracer.continueTrace()`:

```typescript
const traceId = req.headers["x-trace-id"];
const parentNodeId = req.headers["x-parent-node-id"];
const targetNodeId = req.headers["x-target-node-id"];
const parentDepth = parseInt(req.headers["x-depth-index"], 10);

// Re-acquire and continue trace context seamlessly
const paymentRootNode = Tracer.continueTrace(
  traceId,
  parentNodeId,
  "POST /payments/charge",
  NodeType.HTTP_SERVER,
  parentDepth
);

// Match target node ID from context headers to stitch the connecting SVG wire perfectly
paymentRootNode.id = targetNodeId;

try {
  paymentRootNode.markProcessed();
  
  // Downstream execution...
  
  paymentRootNode.markCompleted({ chargedAmount: 150.0 });
} catch (error) {
  paymentRootNode.markCompleted({ success: false });
}
```

---

## 5. Sleek Async Wrapper Helpers

For maximum safety and zero chance of forgotten un-ended spans, use the SDK's functional wrapper helpers. They guarantee complete pair matches even in the event of thrown exceptions:

```typescript
// Wrapper for internal async operations
const result = await rootNode.traceChild(
  "calculateTotal()",
  NodeType.FUNCTION,
  async (childNode) => {
    // Child block is automatically started and marked as processing
    return price * taxRate;
    // Child block is automatically closed and ended upon return or throw!
  }
);
```

For cross-container calls:
```typescript
const orderResponse = await rootNode.traceChildInContainer(
  {
    containerId: "container-inventory-svc",
    name: "gRPC DecrementInventory",
    nodeType: NodeType.HTTP_CLIENT
  },
  async (childNode) => {
    return await grpcClient.decrementStock(itemDetails);
  }
);
```

---

## 6. Cleanup & Shutdown

Always call `Tracer.shutdown()` before exiting your process to guarantee that all final telemetry batches in memory are flushed to ClickHouse and background timers are cleared cleanly.

```typescript
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await Tracer.shutdown();
  process.exit(0);
});
```

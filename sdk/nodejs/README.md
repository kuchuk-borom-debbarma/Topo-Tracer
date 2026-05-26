# @topo-tracer/sdk (Node.js)

The Topo-Tracer Node.js SDK provides a powerful, manual, and intuitive API for instrumenting your Node.js microservices and capturing distributed traces. The SDK automatically batches telemetry data (containers, traces/nodes, and inter-service edges) and flushes them asynchronously to the `carno.js` backend, ensuring high performance with zero event-loop blocking.

## Installation

```bash
npm install @topo-tracer/sdk
```

*(Note: If testing locally from the repository, ensure you have run `npm install` and `npm run build` in this directory)*

## Quick Start

### 1. Initialize the Tracer
Initialize the `Tracer` globally when your application starts. You only need to do this once per process. This registers your current microservice as a `Container`.

```typescript
import { Tracer } from '@topo-tracer/sdk';

Tracer.init(
  { 
    baseUrl: 'http://localhost:3000', // URL of your carno.js backend
    batchSize: 100,                   // Optional: Max items before flushing
    flushIntervalMs: 2000             // Optional: Flush timer in milliseconds
  },
  { 
    name: 'OrderService', 
    containerType: 'Node.js Process',
    // id: 'custom-container-id' // Optional: provide a fixed ID, otherwise one is generated
  }
);
```

### 2. Start a Trace
When an entry point is triggered (like an incoming HTTP request or a Cron Job), start a new trace.

```typescript
// Start a new trace node at depth 0
const rootNode = Tracer.startTrace('POST /api/orders', 'http_server_request');

// Once initial processing/queueing is done:
rootNode.markProcessed();
```

### 3. Create Child Spans (Nodes)
For operations you want to measure within the same trace (like database queries, Redis calls, or heavy computations), create a child node.

```typescript
const dbNode = rootNode.startChild('INSERT INTO orders', 'database_query');

// ... perform database operation ...

// Mark it as processed and completed
dbNode.markProcessed();
dbNode.markCompleted({ rowsInserted: 1 }); // Optional metadata object
```

### 4. Distributed Tracing (Recording Edges)
When your service calls another microservice, you record an **Egress Edge**. This tells the Topo-Tracer visualizer how microservices communicate.

```typescript
const targetContainerId = 'payment-svc-1';
const targetNodeId = 'node-id-received-from-downstream'; // Often propagated via HTTP headers

// Record that we made a network hop to another container
rootNode.recordEgressEdge(targetContainerId, targetNodeId, 'http_client_request');
```

### 5. Complete the Trace
Always remember to complete your nodes so they are batched and exported.

```typescript
rootNode.markCompleted({ status: 200, orderId: 123 });
```

### 6. Graceful Shutdown
To ensure no telemetry is lost when your process exits, flush the remaining data in memory.

```typescript
process.on('SIGINT', async () => {
  await Tracer.shutdown();
  process.exit(0);
});
```

---

## Advanced API

### Continuing an Existing Trace
If your service receives an incoming request that was already traced by an upstream service, you shouldn't call `startTrace()`. Instead, use `continueTrace()` using the IDs propagated via the HTTP headers.

```typescript
// Example: receiving IDs from incoming HTTP headers
const incomingTraceId = req.headers['x-trace-id'];
const parentNodeId = req.headers['x-parent-node-id'];
const depthIndex = parseInt(req.headers['x-depth-index'] || '0', 10);

const rootNode = Tracer.continueTrace(
  incomingTraceId, 
  parentNodeId, 
  'POST /api/payments', 
  'http_server_request',
  depthIndex
);
```

### Manual Flushing
If you need to force-flush telemetry immediately (e.g., in a serverless AWS Lambda environment before the container freezes), use:

```typescript
await Tracer.flush();
```

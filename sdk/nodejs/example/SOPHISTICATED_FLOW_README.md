# Sophisticated Flow Expected Output

This document outlines the exact expected topology, node nesting (with depths), and edges that should be stored in the `carno.js` (ClickHouse) backend after running the `sophisticated_flow.ts` simulation.

This serves as a ground-truth document to query the backend tables (`containers`, `nodes`, `edges`) to ensure the SDK is correctly pushing structured telemetry.

---

## 1. Expected Containers
You should see 4 distinct containers in the `containers` table:
1. `container-order-api` (Order API Gateway)
2. `container-payment-svc` (Payment Processing Service)
3. `container-inventory-worker` (Inventory Kafka Consumer)
4. `container-reporting-batch` (Nightly Batch Reporting Cron)

---

## 2. Expected Execution Tree (Nodes Table)
Most of these nodes will share the **exact same `trace_id`**. The tree should look like this, matching the `depthIndex`:

```text
(Depth: 0) [Node] "POST /v1/checkout" (Container: Order API)
 │
 ├── (Depth: 1) [Node] "DB: Fetch User"        ┐ (Concurrent
 ├── (Depth: 1) [Node] "API: Fraud Check"      ┘  Execution)
 │
 ├── (Depth: 1) [Node] "HTTP POST /payments/charge"
 │    │
 │    └── (Depth: 2) [Node] "POST /payments/charge" (Container: Payment Service)  <-- Trace Continuation (HTTP)
 │         ├── (Depth: 3) [Node] "Stripe API Charge" (ERROR: card declined)       <-- Error Flow
 │         └── (Depth: 3) [Node] "Paypal API Fallback"                            <-- Fallback Flow
 │
 ├── (Depth: 1) [Node] "Kafka Produce: OrderCreated"
 │    │
 │    └── (Depth: 2) [Node] "Consume Kafka: OrderCreated" (Container: Inventory)  <-- Trace Continuation (Async)
 │         └── (Depth: 3) [Node] "DB: Decrement Stock"
 │
 └── (Depth: 0) [Node] "Cron: Process Nightly Reports" (Container: Reporting)     <-- Independent Batch Root
      │
      ├── (Depth: 1) [Node] "Process Report Item" (Trace = Original Order ID)     <-- Trace Continuation (Fan-Out)
      └── (Depth: 0) [Node] "Process Report Item" (Trace = Unknown 2nd Item ID)   <-- Trace Continuation (Fan-Out)
```

### Key Validation Checks in `nodes` table:
- **Concurrent Nodes**: `DB: Fetch User` and `API: Fraud Check` will have overlapping `initiatedAtLocal` and `processedAtLocal` timestamps.
- **Error Flagging**: The `Stripe API Charge` node will have JSON in the `metadata` column where `"error": true` and `"errorMessage"` exists.
- **Fan-Out (Batch Processing)**: Service D (Reporting) has its own independent trace (`Cron: Process Nightly Reports`) acting as the batch runner, but it spawns child nodes that *belong to the individual traces* pulled from the queue, allowing the UI to connect back to the original order trace.

---

## 3. Expected Network Hops (Edges Table)
You should see **exactly 3 records** in the `edges` table for the primary trace. 

These represent the inter-container boundaries.

### Edge 1: HTTP Call to Payment Service
- `fromContainerId`: `container-order-api`
- `toContainerId`: `container-payment-svc`
- `fromNodeId`: ID of `HTTP POST /payments/charge`
- `toNodeId`: ID of `POST /payments/charge` (Depth 2)
- `edgeType`: `http_request`

### Edge 2: Async Message to Inventory Service
- `fromContainerId`: `container-order-api`
- `toContainerId`: `container-inventory-worker`
- `fromNodeId`: ID of `Kafka Produce: OrderCreated`
- `toNodeId`: ID of `Consume Kafka: OrderCreated` (Depth 2)
- `edgeType`: `kafka_message`

### Edge 3: Queue Message to Reporting Service
- `fromContainerId`: `container-order-api`
- `toContainerId`: `container-reporting-batch`
- `fromNodeId`: ID of `POST /v1/checkout`
- `toNodeId`: ID of `Process Report Item`
- `edgeType`: `sqs_message`

---

## 4. Querying ClickHouse for Verification
Once the backend is running, run this query to visually verify the stack:

```sql
SELECT 
    depthIndex, 
    containerId, 
    name, 
    JSONExtractString(metadata, 'error') as isError
FROM toco_tracer.nodes
WHERE trace_id = '<your-trace-id-here>'
ORDER BY initiatedAtLocal ASC, depthIndex ASC;
```

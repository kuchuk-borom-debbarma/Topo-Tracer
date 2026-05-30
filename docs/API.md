# Topo-Tracer Ingestion & Layout API Specification

This document defines the complete API contracts for both the **Telemetry Ingestion (Write Path)** and the **Trace Layout Engine (Read Path)** inside the Topo-Tracer backend.

Base Path: `/telemetry`

---

## 1. Telemetry Ingestion API (Write Path)

Ingestion is high-throughput, append-only, and logs flat telemetry facts directly to ClickHouse.

### 1.1 Ingest Containers
Register physical or logical service boundaries.

*   **Endpoint:** `POST /telemetry/containers`
*   **Request Headers:** `Content-Type: application/json`
*   **Request Payload Schema (`TraceContainerInput[]`):**
    ```json
    [
      {
        "id": "String (Unique Container ID)",
        "traceId": "String (Globally Unique Trace ID)",
        "name": "String (Container Display Name)",
        "type": "String (Container Type e.g., 'express_api', 'background_worker')",
        "metadata": "Object (Optional custom JSON baggage)",
        "createdAtLocal": "String (ISO 8601 DateTime or Epoch Milliseconds Timestamp)"
      }
    ]
    ```
*   **Example Payload:**
    ```json
    [
      {
        "id": "container-order-api",
        "traceId": "trace-8898-100",
        "name": "Order API Gateway",
        "type": "Express API",
        "metadata": { "region": "us-east-1", "version": "1.4.0" },
        "createdAtLocal": "2026-05-30T13:00:00.000Z"
      }
    ]
    ```
*   **Response (200 OK):**
    ```json
    { "ok": true, "count": 1 }
    ```

---

### 1.2 Ingest Blocks
Register logical function scopes or modular execution domains inside a container.

*   **Endpoint:** `POST /telemetry/blocks`
*   **Request Headers:** `Content-Type: application/json`
*   **Request Payload Schema (`TraceBlockInput[]`):**
    ```json
    [
      {
        "id": "String (Unique Block ID)",
        "traceId": "String (Globally Unique Trace ID)",
        "containerId": "String (Containing Container ID)",
        "name": "String (Scope Function Name e.g., 'checkout()')",
        "type": "String (Scope Type e.g., 'function', 'class_method')",
        "metadata": "Object (Optional custom JSON baggage)"
      }
    ]
    ```
*   **Example Payload:**
    ```json
    [
      {
        "id": "block-checkout",
        "traceId": "trace-8898-100",
        "containerId": "container-order-api",
        "name": "checkout()",
        "type": "function",
        "metadata": { "file": "src/controllers/checkout.ts" }
      }
    ]
    ```
*   **Response (200 OK):**
    ```json
    { "ok": true, "count": 1 }
    ```

---

### 1.3 Ingest Nodes (Lifecycle Events)
Log individual operations or checkpoints inside a block. Nodes are written as append-only lifecycle events (`started` / `ended`).

*   **Endpoint:** `POST /telemetry/nodes`
*   **Request Headers:** `Content-Type: application/json`
*   **Request Payload Schema (`TraceNodeInput[]`):**
    ```json
    [
      {
        "id": "String (Unique Node ID)",
        "traceId": "String (Globally Unique Trace ID)",
        "blockId": "String (Containing Block ID)",
        "name": "String (Node Checkpoint Description)",
        "type": "String (Checkpoint Type e.g., 'db', 'express_api', 'step')",
        "metadata": "Object (Optional custom JSON baggage)",
        "eventType": "String ('started' | 'ended')",
        "eventAtLocal": "String (ISO 8601 DateTime or Epoch Milliseconds Timestamp)"
      }
    ]
    ```
*   **Example Payload:**
    ```json
    [
      {
        "id": "node-db-fetch-user",
        "traceId": "trace-8898-100",
        "blockId": "block-checkout",
        "name": "DB: Fetch User Profile",
        "type": "db",
        "metadata": { "query": "SELECT * FROM users WHERE id = 42" },
        "eventType": "started",
        "eventAtLocal": "2026-05-30T13:00:00.100Z"
      },
      {
        "id": "node-db-fetch-user",
        "traceId": "trace-8898-100",
        "blockId": "block-checkout",
        "name": "DB: Fetch User Profile",
        "type": "db",
        "metadata": { "rowsReturned": 1 },
        "eventType": "ended",
        "eventAtLocal": "2026-05-30T13:00:00.145Z"
      }
    ]
    ```
*   **Response (200 OK):**
    ```json
    { "ok": true, "count": 2 }
    ```

---

### 1.4 Ingest Edges (Lifecycle Connections)
Log flow transitions or network jumps between nodes across blocks. Edges are written as append-only lifecycle events (`requested` / `responded`).

*   **Endpoint:** `POST /telemetry/edges`
*   **Request Headers:** `Content-Type: application/json`
*   **Request Payload Schema (`TraceEdgeInput[]`):**
    ```json
    [
      {
        "id": "String (Unique Edge ID)",
        "traceId": "String (Globally Unique Trace ID)",
        "fromNodeId": "String (Exact Calling Node ID)",
        "toNodeId": "String (Exact Target Node ID)",
        "type": "String (Connection Protocol e.g., 'http_request', 'rpc')",
        "metadata": "Object (Optional custom JSON baggage)",
        "eventType": "String ('requested' | 'responded')",
        "eventAtLocal": "String (ISO 8601 DateTime or Epoch Milliseconds Timestamp)"
      }
    ]
    ```
*   **Example Payload:**
    ```json
    [
      {
        "id": "edge-payment-call",
        "traceId": "trace-8898-100",
        "fromNodeId": "node-db-fetch-user",
        "toNodeId": "node-payment-charge",
        "type": "http_request",
        "metadata": { "url": "https://api.payments.com/charge" },
        "eventType": "requested",
        "eventAtLocal": "2026-05-30T13:00:00.200Z"
      }
    ]
    ```
*   **Response (200 OK):**
    ```json
    { "ok": true, "count": 1 }
    ```

---

## 2. Telemetry Layout API (Read Path)

The read path retrieves dynamically compiled, coordinate-tagged layout structures from pre-computed tables, applying zoom-level filters instantly.

### 2.1 Get Trace Layout
Retrieve the pre-compiled chronological flow sequence and nested call-depth X-offsets for a given trace.

*   **Endpoint:** `GET /telemetry/trace/:traceId`
*   **URL Parameter:**
    *   `traceId` (String): The globally unique trace ID to load.
*   **Query Parameter:**
    *   `zoom_level` (Number, Optional): Desired verbosity/nesting depth threshold. 
        *   `0`: Only critical root entry operations.
        *   `1`: Service scopes and major blocks.
        *   `2+`: Detailed sub-calls, logs, and database statements.
        *   *If omitted, defaults dynamically to the maximum call depth recorded for this trace.*
*   **Response Schema (`TraceLayoutResponse`):**
    ```json
    {
      "metadata": {
        "traceId": "String",
        "isZoomReady": "Boolean (true if worker layout compilation is finished)",
        "maxAvailableDepth": "Number (maximum structural call depth available)",
        "currentDepth": "Number (the active query zoom_level)"
      },
      "blocks": [
        {
          "id": "String (Block ID)",
          "traceId": "String",
          "containerId": "String (Containing service container)",
          "parentBlockId": "String (Empty if root block)",
          "callingNodeId": "String (Triggering Node ID in parent block)",
          "name": "String (Function name)",
          "type": "String",
          "absoluteDepth": "Number (Horizontal offset X-Coordinate)",
          "startTimeUs": "Number (Earliest microsecond start timestamp)",
          "durationUs": "Number (Total execution duration in microseconds)",
          "ancestryPath": "Array of Strings (Container and parent block IDs up to itself)",
          "metadata": "Object (Baggage properties)"
        }
      ],
      "nodes": [
        {
          "id": "String (Node ID)",
          "traceId": "String",
          "blockId": "String (Containing Block ID)",
          "name": "String (Log/Checkpoint name)",
          "type": "String",
          "zoomLevel": "Number (Verbosity level required to see this node)",
          "localSequence": "Number (Vertical flow index Y-Coordinate inside the block card)",
          "startTimeUs": "Number (Microsecond timestamp)",
          "durationUs": "Number | null (Microsecond elapsed duration)",
          "ancestryPath": "Array of Strings (Path from container to block to node)",
          "metadata": "Object (Baggage properties)"
        }
      ],
      "edges": [
        {
          "id": "String (Unique edge jump row ID)",
          "edgeId": "String (Raw TraceEdge.id)",
          "traceId": "String",
          "fromBlockId": "String (Source block)",
          "fromNodeId": "String (Source node)",
          "toBlockId": "String (Target block)",
          "toNodeId": "String (Target node)"
        }
      ]
    }
    ```

*   **Example Response:**
    ```json
    {
      "metadata": {
        "traceId": "trace-8898-100",
        "isZoomReady": true,
        "maxAvailableDepth": 2,
        "currentDepth": 1
      },
      "blocks": [
        {
          "id": "block-checkout",
          "traceId": "trace-8898-100",
          "containerId": "container-order-api",
          "parentBlockId": "",
          "callingNodeId": "",
          "name": "checkout()",
          "type": "function",
          "absoluteDepth": 0,
          "startTimeUs": 1779977558000,
          "durationUs": 45000,
          "ancestryPath": ["container-order-api", "block-checkout"],
          "metadata": { "file": "src/controllers/checkout.ts" }
        }
      ],
      "nodes": [
        {
          "id": "node-db-fetch-user",
          "traceId": "trace-8898-100",
          "blockId": "block-checkout",
          "name": "DB: Fetch User Profile",
          "type": "db",
          "zoomLevel": 1,
          "localSequence": 0,
          "startTimeUs": 1779977558100,
          "durationUs": 45,
          "ancestryPath": ["container-order-api", "block-checkout", "node-db-fetch-user"],
          "metadata": { "rowsReturned": 1 }
        }
      ],
      "edges": [
        {
          "id": "edge-payment-call_wire",
          "edgeId": "edge-payment-call",
          "traceId": "trace-8898-100",
          "fromBlockId": "block-checkout",
          "fromNodeId": "node-db-fetch-user",
          "toBlockId": "block-charge",
          "toNodeId": "node-payment-charge"
        }
      ]
    }
    ```

---

## 3. Visual Layout Coordinate Mapping

When rendering the layout in your UI:
1.  **Horizontal Nesting Depth (X-offset):** Map the indentation directly to the block's `absoluteDepth` (e.g. `leftMargin = absoluteDepth * 24px`).
2.  **Vertical Chronological Flow (Y-offset):** Render nodes inside each block sequentially using `localSequence` as the vertical index card stack.
3.  **Client-Side Snapping (Visual Wires):** When drawing an edge, if either `fromNodeId` or `toNodeId` is hidden at the current `zoom_level`, scan that node's `ancestryPath` backwards. Select the deepest ancestor ID that is currently visible in the active UI element list and snap the wire endpoint to it. This resolves edge snapping dynamically in microseconds.

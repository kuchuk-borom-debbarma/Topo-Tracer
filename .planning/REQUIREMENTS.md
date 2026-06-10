# Requirements - Node.js Tracing SDK

## Functional Requirements
- **FR-01: Manual Span Management**
  - Ability to start and end nodes (spans).
  - Ability to create edges (relationships) between nodes.
  - Support for custom metadata (tags/data) on nodes and edges.
- **FR-02: Trace Context Propagation**
  - Automatic TraceID generation.
  - Support for importance levels to guide projection filtering.
- **FR-03: Batching & Async Ingestion**
  - Collect events in memory and send in batches.
  - Asynchronous sending to avoid blocking the main thread.
  - Configurable batch size and flush interval.
- **FR-04: Retry Logic**
  - Configurable retry attempts for failed ingestion requests.
  - Exponential backoff strategy.
- **FR-05: API Key Authentication**
  - SDK must include an API key in headers for all ingestion requests.

## Non-Functional Requirements
- **NFR-01: Low Overhead** - Minimal CPU and memory impact on the host application.
- **NFR-02: Zero Dependencies** - Minimize external dependencies to avoid bloat and conflicts.
- **NFR-03: Type Safety** - Full TypeScript support for better developer experience.

## Ingestion API (Hono Server)
- **Endpoint:** `POST /api/v1/ingest`
- **Payload:**
  ```json
  {
    "userId": "string",
    "nodeStarts": [...],
    "edgeStarts": [...],
    "nodeEnds": [...],
    "edgeEnds": [...]
  }
  ```
- **Auth:** `X-API-Key` header.

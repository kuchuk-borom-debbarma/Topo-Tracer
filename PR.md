# Pull Request: Topo-Tracer Node.js SDK Implementation

## Overview
This PR implements the official Node.js SDK for the Topo-Tracer project. The SDK is a lightweight, high-performance tracing client designed specifically for our graph-based telemetry model. It supports automated parent-child context propagation via `AsyncLocalStorage`, background batching, and distributed tracing.

## Key Features
- **Fluent API:** Developer-friendly instrumentation using `tracer.trace('name', async (span) => { ... })`.
- **Automatic Context Propagation:** Uses Node.js `AsyncLocalStorage` to implicitly link spans and create graph edges.
- **Distributed Tracing:** Seamlessly inject and extract trace context across service boundaries via HTTP headers.
- **High Performance & Reliability:**
  - Background batching with configurable size and interval triggers.
  - Hard cap of 1000 events per batch to protect the backend.
  - Exponential backoff with random jitter for network resilience.
  - `onDrop` hooks for custom data loss handling.
- **Production Ready:**
  - Comprehensive documentation and technical guides.
  - Built-in integration for **Hono** and **Express**.
  - Bun-native testing and benchmarking suite using `mitata`.
  - Process lifecycle hooks (`SIGTERM`, `beforeExit`) for graceful shutdown.

## Project Structure
- `sdks/node-js/src/`: Core SDK logic (Tracer, Span, Context).
- `sdks/node-js/examples/`: Real-world usage examples (Basic, Distributed, Hono, Express).
- `sdks/node-js/docs/`: Detailed guides for distributed tracing and performance tuning.
- `sdks/node-js/tests/`: Unit, integration, and stress tests.

## Backend Changes
- Added `POST /api/v1/ingest` endpoint to `hono-server/src/index.ts` to support SDK telemetry ingestion.

## Verification Results
All tests were executed using Bun and are passing:
- **Unit/Integration Tests:** Verified core logic and E2E connectivity.
- **Stress Tests:** Verified SDK stability under high load (1000+ spans) and resilience against 429/503 errors.
- **Benchmarks:** Measured minimal overhead for span creation and context hops.

```bash
cd sdks/node-js
bun test
```

## How to use
```typescript
import { Tracer } from '@topo-tracer/node-sdk';

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'your-api-key',
  userId: 'user-123'
});

await tracer.trace('my-operation', async (span) => {
  span.setAttribute('key', 'value');
  // Child spans are automatically linked!
  await tracer.trace('child-task', () => { ... });
});
```

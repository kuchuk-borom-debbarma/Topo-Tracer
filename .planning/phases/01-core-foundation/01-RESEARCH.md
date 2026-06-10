# Research: Phase 1 - Core SDK Foundation & Server Ingestion

## 1. Hono Server Ingestion
### Ingestion Endpoint (`POST /api/v1/ingest`)
- **Location:** New route in `hono-server/src/index.ts`.
- **Logic:**
  - Extract `userId` and `X-API-Key` from headers or payload (per decisions).
  - Use `logService.ingestNodesNEdges(data)` to process the batch.
  - Return `200 OK` on success.
- **Service Wiring:** `logService` is already exported in `hono-server/src/services/log/index.ts` and available in `index.ts`.

### Middleware Strategy
- Create a lightweight middleware for `userId` and `X-API-Key` extraction.
- For now, this can live in `hono-server/src/index.ts` or a new `hono-server/src/common/middleware.ts` if we want to follow the codebase structure.
- **Payload Validation:** Should validate basic presence of required fields (`userId`, `nodeStarts`, etc.) to fail fast before service call.

## 2. Node.js SDK (`sdks/node-js`)
### Core Architecture
- **Tracer Class:** Singleton or instance managing `AsyncLocalStorage`.
- **Span Class:** Implements Fluent API.
  - `tracer.startNode(type)` -> returns `Span`.
  - `span.setData(key, value)` -> returns `this`.
  - `span.end()` -> closes span and tracks duration.
- **Context Management:** `AsyncLocalStorage` will store the `currentSpanId`. When a new span starts, it checks for a parent in context and automatically creates an `edge` if one exists.

### Project Setup (npm-ready)
- **Bun:** Used for `bun install`, `bun test`, and `bun run build`.
- **Package structure:**
  - `src/index.ts`: Entry point.
  - `src/Tracer.ts`: Core logic.
  - `src/Span.ts`: Fluent API implementation.
  - `src/types.ts`: Shared types.
- **Dependencies:** `undici` or native `fetch` (since Node 18+) for HTTP ingestion.

## 3. Communication Contract
- **Payload Mapping:**
  - SDK will maintain a list of `nodeStarts`, `nodeEnds`, `edgeStarts`, and `edgeEnds`.
  - For Phase 1, it will send a batch immediately on `span.end()` to verify wiring.
  - Payload matches `ILogService.ingestNodesNEdges` parameters.

## 4. Verification Plan
- **Integration Test:** A script in `sdks/node-js/tests/integration.test.ts` that starts a span, ends it, and verifies the server returns `200`.
- **Server Test:** Unit test for the new Hono route.

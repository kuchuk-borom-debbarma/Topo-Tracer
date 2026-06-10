# Phase 1 Context: Core SDK Foundation & Server Ingestion

## Overview
Phase 1 focuses on establishing the communication bridge between the Node.js SDK and the Hono backend. This includes creating the ingestion endpoint in the server and the basic client structure in the SDK.

## Decisions & Constraints

### 1. User Identity & Authentication
- **User Identification:** For this phase, the `userId` will be provided by the user during SDK initialization and sent with every ingestion request.
- **Authentication:** Formal API key validation logic is **deferred**. The server will accept the `X-API-Key` header but will not validate it against a database yet.
- **Future-proofing:** The ingestion payload structure remains compatible with the server's `ILogService.ingestNodesNEdges` contract.

### 2. Hono Server Ingestion Endpoint
- **Path:** `POST /api/v1/ingest`
- **Controller Logic:** The route handler will extract the payload, pass it directly to `logService.ingestNodesNEdges`, and return `200 OK` upon successful completion of the service call.
- **Middleware:** A placeholder middleware will be created to extract the `X-API-Key` and `userId` (if provided via headers/payload).

### 3. SDK Project Structure & Tooling
- **Location:** `sdks/node-js/`
- **Runtime/Tooling:** **Bun** for package management, testing, and development.
- **Pattern:** **Fluent API** for span management (e.g., `tracer.startNode(...).setData(...).end()`).
- **Context:** **AsyncLocalStorage** for automatic parent-child edge creation.
- **Distribution:** Configured to be **npm publish-ready**.

### 4. Communication Strategy
- **Protocol:** HTTP/1.1 (JSON).
- **Format:** The SDK will initially send events immediately (synchronously) to verify the server-side wiring before Phase 2's batching implementation.

## Reusable Assets & Patterns
- **Server:** Use the existing `ClickHouse` and `Postgres` middleware patterns found in `hono-server/src/infra/db`.
- **Server:** Follow the service-repo-contract pattern established in `hono-server/src/services/log`.
- **SDK:** Model the `Span` and `Tracer` types after the existing `ILogService` types in `hono-server/src/services/log/api/types.ts`.

## Open Questions (Deferred to Research)
- Best way to handle process-exit cleanup in Node.js to ensure final events are flushed (relevant for Phase 2, but good to keep in mind).
- Precise payload mapping between SDK-native objects and server-expected `IngestNodeStart`, etc.

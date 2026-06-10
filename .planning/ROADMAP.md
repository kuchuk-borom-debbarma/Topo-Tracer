# Roadmap - Node.js Tracing SDK

## Phase 1: Core SDK Foundation & Server Ingestion
- [x] **1.1: Hono Server Ingestion Endpoint**
  - Implement `POST /api/v1/ingest` in `hono-server`.
  - Wire the endpoint to `logService.ingestNodesNEdges`.
  - Add API key middleware.
- [x] **1.2: SDK Base Structure**
  - Initialize `sdks/node-js` project.
  - Define core types (Span, Trace, Event).
- [x] **1.3: Basic Ingestion Client**
  - Implement a basic HTTP client for sending events.
  - Support API key authentication.

## Phase 2: Advanced SDK Features
- [x] **2.1: Batching & Buffer Management**
  - Implement background batching logic.
  - Add flush-on-interval and flush-on-size triggers.
- [x] **2.2: Retry Logic**
  - Add retry mechanism with backoff for ingestion failures.
- [x] **2.3: Lifecycle Hooks**
  - Support for `flush()` and `shutdown()` to ensure all events are sent before process exit.
- [x] **2.4: Distributed Tracing**
  - Support for context extraction and injection.

## Phase 3: Developer Experience & Hardening
- [ ] **3.1: Documentation & Examples**
  - Add README and usage examples.
- [ ] **3.2: Unit & Integration Tests**
  - Exhaustive testing of batching, retries, and server compatibility.
- [ ] **3.3: Performance Benchmarking**
  - Measure overhead and throughput.

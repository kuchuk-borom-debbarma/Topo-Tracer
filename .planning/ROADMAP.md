# Roadmap: Node.js SDK (Fresh Start)

## Phase 1: Core Foundation
**Goal:** Implement the basic SDK structure and types with behavioral verification.
**Plans:** 1/3 plans executed
- [x] 01-01-PLAN.md — Initialize package and define core telemetry types.
- [ ] 01-02-PLAN.md — Implement Tracer and Span with ALS, implicit/explicit edges, and core tests.
- [ ] 01-03-PLAN.md — Implement BatchExporter with configurable intervals and batching tests.

## Phase 2: Hono Ingestion Support
**Goal:** Ensure the backend can receive data from the new SDK.
- [ ] Implement `/telemetry/ingest` endpoint in `hono-server`.
- [ ] Wire endpoint to `LogServiceImpl.ingestNodesNEdges`.
- [ ] Add basic authentication/validation to ingestion.

## Phase 3: Hardening & Examples
**Goal:** Verify the SDK with real-world scenarios.
- [ ] Add comprehensive unit tests for batching and retries.
- [ ] Create example scripts (Basic, Async, Distributed).
- [ ] Document the "Fresh Start" API.

## Phase 4: Migration & Cleanup
**Goal:** Transition away from the old SDK.
- [ ] Port any critical features from `sdk/nodejs` if missing.
- [ ] Update documentation to point to the new SDK.

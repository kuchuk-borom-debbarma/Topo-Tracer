# Requirements: Node.js SDK (Fresh Start)

## Functional Requirements (FR)
- [ ] **FR-1: Tracer Lifecycle**: Initialize and configure the SDK with backend URL and service metadata.
- [ ] **FR-2: Span Management**: Start, end, and record metadata on spans (nodes).
- [ ] **FR-3: Explicit Edges**: Create edges between spans with optional labels and importance levels.
- [ ] **FR-4: Importance Levels**: Support setting importance on nodes and edges for backend projection.
- [ ] **FR-5: Batch Export**: Automatically batch events and send them to the backend ingest endpoint.
- [ ] **FR-6: Flush/Shutdown**: Support manual flushing and graceful shutdown to ensure no data loss.

## Technical Requirements (TR)
- [x] **TR-1: TypeScript Implementation**: Full type coverage for all public and internal APIs.
- [ ] **TR-2: Runtime Compatibility**: Support Node.js 18+ and modern runtimes (Bun, Deno).
- [ ] **TR-3: Error Resilience**: Handle network failures with retries and exponential backoff.
- [x] **TR-4: Zero Dependencies**: Avoid npm dependencies for the core SDK logic.
- [x] **TR-5: Backend Alignment**: Match `IngestNodeStart`, `IngestNodeEnd`, etc., types from `hono-server`.

## Design Requirements (DR)
- **DR-1: Fluent API**: `tracer.startSpan('name').end()` style API.
- **DR-2: Thread Safety**: Ensure concurrent spans don't leak state.
- **DR-3: Trace Context**: Support propagation of trace IDs across asynchronous boundaries.

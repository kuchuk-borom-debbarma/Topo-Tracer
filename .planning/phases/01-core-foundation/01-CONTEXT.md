# Phase 1 Context: Core Foundation (Node.js SDK)

## Decisions

### Module System: ESM-only
- **Decision:** The SDK will be implemented as a pure ESM package.
- **Rationale:** Aligns with modern Node.js standards (18+) and simplifies the "Fresh Start" by avoiding CJS/ESM dual-maintenance.

### Async Context: AsyncLocalStorage (ALM)
- **Decision:** Use `AsyncLocalStorage` to automatically track the "Active Span".
- **Strategy:** 
  - `tracer.startSpan(name)` will automatically pick up the active span from ALM as the parent.
  - **Edge Cases:** If ALM context is lost (e.g., across legacy library boundaries), users can manually pass a `parentSpan` in the options.
  - **Performance:** ALM is highly optimized in Node 18+; overhead is negligible for standard instrumentation.

### API Design: Implicit Edges via Nesting
- **Decision:** The primary way to create graph links is through nesting.
- **API:** `parentSpan.startChild(name)` or `tracer.startSpan(name)` (which uses ALM to find the parent).
- **Behavior:** Starting a "Child" span automatically emits:
  1. `IngestNodeStart` for the new span.
  2. `IngestEdgeStart` from the parent to the new span.
- **Manual Edges:** `tracer.addEdge(from, to, label)` will still be available for non-nested causal links.

### Batching & Exporting
- **Decision:** Use a debounced batching strategy with native `fetch`.
- **Interval:** 5 minutes (default, as requested).
- **Size Limit:** 1,000 events per batch (approx 1MB payload).
- **Shutdown:** Implement `tracer.shutdown()` and `tracer.flush()` to ensure the final buffer is sent before process exit.

### Core Implementation
- **Zero-Dependency:** Use `globalThis.crypto.randomUUID()` for IDs and `globalThis.fetch` for networking.
- **Types:** Align strictly with `hono-server/src/services/log/api/types.ts`.

## Open Questions / Risks
- **5 Minute Flush:** 5 minutes is quite long for high-traffic apps; we should ensure users can easily tune this down to 5-10 seconds.
- **Node.js < 18:** This SDK will explicitly NOT support older Node versions due to reliance on `fetch` and `crypto.randomUUID`.

## Next Steps
- Initialize `sdks/node-js` with `package.json` (type: module).
- Define shared types in `src/types.ts`.
- Implement `Tracer` with `AsyncLocalStorage`.

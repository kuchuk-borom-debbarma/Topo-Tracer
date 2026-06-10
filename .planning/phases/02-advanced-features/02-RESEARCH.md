# Research: Phase 2 - Advanced SDK Features

## 1. Batching & Buffer Management
- **Implementation:**
  - Introduce an `EventBuffer` to collect `nodeStarts`, `nodeEnds`, `edgeStarts`, and `edgeEnds`.
  - Configurable `batchSize` (default: 100, hard cap: 1000) and `flushInterval` (default: 5000ms).
  - `flush()` method will clear the buffer and trigger the ingestion request.
  - Periodic flush using `setInterval`, which is cleared on `shutdown()`.

## 2. Retry Strategy with Jitter
- **Algorithm:**
  - Base delay: 1000ms.
  - Multiplier: 2.
  - Jitter: `Math.random() * 1000`.
  - Max retries: 5.
- **Queueing:**
  - Failed batches will be added to a `retryQueue`.
  - If a batch fails after all retries, the `onDrop` hook (if provided in `TracerConfig`) is called.

## 3. Distributed Tracing Support
- **External Context:**
  - `startNode` will now support `parentSpanId` explicitly.
  - If `parentSpanId` is provided, the SDK will create an edge from `parentSpanId` to the new span's ID, even if `parentSpanId` is not in the current `AsyncLocalStorage` context.
- **Context Propagation:**
  - `tracer.extractContext()`: Returns `{ traceId, spanId }` for the current active span.
  - `tracer.injectContext(context)`: Sets the current active span context (for remote calls).

## 4. Process Lifecycle Hooks
- **Auto-Flush:**
  - Register listeners for `SIGTERM`, `SIGINT`, and `beforeExit`.
  - These listeners will call `tracer.shutdown()`, which flushes the buffer and waits for pending requests.

## 5. Technical Details
- **AsyncLocalStorage Priority:** If both `AsyncLocalStorage` and an explicit `parentSpanId` are present, the explicit `parentSpanId` takes precedence (allowing manual overrides).
- **Concurrency:** Ensure that multiple `flush` calls don't interfere (use a `flushing` flag).

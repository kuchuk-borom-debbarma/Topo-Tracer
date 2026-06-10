# Phase 2 Context: Advanced SDK Features & Distributed Tracing

## Overview
Phase 2 enhances the Node.js Tracing SDK with performance-oriented features (batching, retries) and structural support for distributed tracing (context propagation).

## Decisions & Constraints

### 1. Batching & Buffer Management
- **Triggers:** Automatic flushing based on `batchSize` and `flushInterval`.
- **Manual Control:** Expose a `flush()` method for immediate delivery.
- **Batch Size:** Configurable, but with a **hard cap of 1000 events** per batch for server safety.
- **Overflow Policy:** If the internal buffer exceeds capacity while the server is unreachable, the SDK will **drop incoming events** (simplest "drop-newest" or "drop-all" strategy) for now. Disk-based persistence is deferred.

### 2. Retry Logic & Reliability
- **Strategy:** Exponential backoff with **jitter** to prevent thundering herd issues.
- **Error Handling:** Provide a **hook** (callback) in the SDK configuration to notify the host application when a batch fails after all retries or when events are dropped.
- **Shutdown:** Implement a `shutdown()` method that ensures all buffered events are flushed before the process exits.

### 3. Distributed Tracing Support
- **Context Injection/Extraction:** Update the `Tracer` and `Span` to support starting a trace from an **external context** (e.g., headers received from a remote service).
- **Context Shape:** Must support passing `traceId` and `parentSpanId` to the `startNode` method to preserve the graph across service boundaries.

### 4. Process Lifecycle
- **Automatic Cleanup:** The SDK will attempt to hook into standard process lifecycle events (`SIGTERM`, `beforeExit`) to trigger an automatic flush/shutdown, but will also mandate the `shutdown()` method for clean programmatic control.

## Reusable Assets & Patterns
- **SDK:** Extend the existing `Tracer` and `Span` classes.
- **Context:** Continue using `AsyncLocalStorage` for local context, but expose methods to serialize/deserialize it for remote calls.

## Open Questions (Deferred to Research)
- Exact API signature for the failure hook and external context injection.
- Interaction between `AsyncLocalStorage` and manually provided parent IDs (priority rules).

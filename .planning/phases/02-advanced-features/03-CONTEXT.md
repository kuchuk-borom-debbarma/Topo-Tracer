# Phase 3 Context: Developer Experience & Hardening

## Overview
Phase 3 focuses on transforming the functional Node.js SDK into a production-grade tool. This includes extensive documentation, a variety of real-world examples, and rigorous performance validation.

## Decisions & Constraints

### 1. Documentation & Guides
- **Comprehensive README:** API reference, installation, and quick start.
- **Dedicated Guides:** Detailed documentation for:
    - Context Propagation (AsyncLocalStorage).
    - Distributed Tracing setup.
    - Performance tuning (batching/retry config).

### 2. Extensive Examples
- **Basic Usage:** Simple script showing node and edge creation.
- **Distributed Tracing:** E2E example with two services (e.g., Service A calling Service B) demonstrating context injection and extraction.
- **Framework Integrations:**
    - **Hono:** Using the SDK within a Hono server (native to this project).
    - **Express:** Showing integration with the most popular Node.js framework.
- **Error Handling:** Example showing how to use the `onDrop` hook and handle ingestion failures.

### 3. Rigorous Hardening & Benchmarking
- **Success Metrics:**
    - **Latency:** Overhead added to a standard function call.
    - **Memory:** Buffer footprint under sustained high load.
    - **Throughput:** Maximum sustained event ingestion rate.
- **Resilience Testing:**
    - Simulated backend failures: `429 Too Many Requests` (backoff check) and `503 Service Unavailable`.
    - Process stress: Performance under high CPU/Memory pressure.
- **Leak Detection:** Long-running tests to ensure `AsyncLocalStorage` and buffers don't leak memory.

### 4. Distribution Preparation
- Finalize `package.json` exports and types for seamless `npm install` experience.

## Reusable Assets & Patterns
- **Server:** Use the existing `hono-server` as the target for examples.
- **Tests:** Leverage `vitest` (via Bun) for benchmarking and stress tests.

## Open Questions (Deferred to Research)
- Specific benchmarking tool/harness to use (e.g., `mitata` or custom script).
- Best structure for the `examples/` directory to keep it maintainable.

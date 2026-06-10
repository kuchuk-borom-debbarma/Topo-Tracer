# Research: Phase 3 - Developer Experience & Hardening

## 1. Documentation Structure
- **README.md:**
    - High-level overview.
    - Installation (Bun/NPM).
    - Quick start (5-line example).
    - API Reference (Tracer, Span).
    - Configuration options (Batching, Retries).
- **Guides (`docs/*.md`):**
    - `distributed-tracing.md`: How to propagate context across HTTP headers.
    - `performance-tuning.md`: Deep dive into buffer management and retry strategies.

## 2. Examples Structure (`sdks/node-js/examples/`)
- `basic/`: Single file showing manual span and edge creation.
- `distributed/`: Two small scripts (`client.ts`, `server.ts`) demonstrating context propagation.
- `hono/`: Integration with Hono (using middleware pattern).
- `express/`: Integration with Express.

## 3. Benchmarking Harness
- **Tool:** `mitata` for micro-benchmarks.
- **Scenarios:**
    - `startNode` overhead (latency).
    - `AsyncLocalStorage` hop cost.
    - Buffer insertion throughput.
- **Stress Test:** A script that generates 10k spans in a loop and monitors memory usage and ingestion success rate.

## 4. Hardening & Resilience
- **Error Injection:** Use a mock server that returns 429 and 503 to verify exponential backoff and `onDrop` hook behavior.
- **Leak Detection:** Use Node.js `--inspect` or memory snapshots in Bun to verify the buffer is properly cleared after flushing.

## 5. Technical Details for Examples
- **Hono Example:** Use `hono` package.
- **Express Example:** Use `express` package.
- **Distributed Example:** Use `fetch` with `X-Trace-Id` and `X-Span-Id` headers.

# Project: Topo-Tracer Node.js SDK (Fresh Start)

## Context
As Topo-Tracer migrates to a Hono-based backend, we need a fresh, modern Node.js SDK that is easy for developers to integrate. The existing SDK is being replaced by this "Fresh Start" version in `sdks/node-js` to improve maintainability, type safety, and ease of use.

## Goals
- **Ease of Use**: Provide a fluent and intuitive API for instrumenting applications.
- **TypeScript-First**: Ensure first-class type safety for all SDK features.
- **Efficient Exporting**: Implement smart batching and reliable delivery to the Hono backend.
- **Modern Stack**: Target Node.js 18+ using native `fetch` and modern TypeScript patterns.
- **Hono Integration**: Align perfectly with the `ILogService` ingestion contracts in `hono-server`.

## Technical Strategy
- **Modular Design**: Separate core tracing logic from the exporting mechanism.
- **Batch Exporter**: Implement a debounced batch exporter to minimize network overhead.
- **Native Fetch**: Use the native `fetch` API for maximum compatibility across environments.
- **Explicit Relationships**: Focus on explicit edge creation to match Topo-Tracer's graph model.

## Constraints
- **Zero-Dependency Core**: Minimize external dependencies to reduce security surface and bundle size.
- **Node.js 18+**: Utilize built-in features like `fetch` and `WebCrypto` for UUIDs.
- **Performance**: Ensure instrumentation overhead is negligible.

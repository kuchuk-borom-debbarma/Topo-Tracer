# Phase 3 Context: SDK Integration

## Domain
Phase 3 implements the SDK-side changes to support trace names. This includes updating the `Tracer` class API and the internal ingestion payload mapping.

## Decisions
### SDK API
- **D-11: API Signature**: Update `Tracer.trace` to accept an optional `traceName` parameter.
- **D-12: Implementation**: If provided, the `traceName` will be passed to `startNode`.

### Root Enforcement
- **D-13: Root Identification**: A node is considered a "root node" if it has no `parentSpanId` (determined via `AsyncLocalStorage`).
- **D-14: Conditional Attachment**: The SDK will ONLY include the `traceName` in the `IngestNodeStart` payload if the node is identified as a root node.

## Canonical Refs
- `sdks/node-js/src/Tracer.ts` (API source)
- `sdks/node-js/src/types.ts` (DTO source)

## Code Context
- `Tracer.trace`: Needs to accept `traceName`.
- `Tracer.startNode`: Needs to accept `traceName` and attach it to `IngestNodeStart` if no parent exists.
- `IngestNodeStart`: Needs to include `traceName?: string`.

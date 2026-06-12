# Phase 5 Context: Verification

## Domain
Phase 5 delivers a standalone end-to-end verification script and a final project audit.

## Decisions
### E2E Script
- **D-20: Script Target**: A Node.js script that:
  1. Uses the actual SDK (`@topo-tracer/node-sdk`) to start a named trace.
  2. Flushes the trace to the backend.
  3. Polls the backend API (`GET /api/v1/traces`) to verify the trace appears with the correct name.
- **D-21: Robustness**: The script will handle backend availability checks and wait for materialization.

## Canonical Refs
- `sdks/node-js/src/index.ts` (SDK Entry)
- `hono-server/src/api/v1/traces` (API Endpoint)

## Code Context
- Need a `verify-trace-name.ts` script.

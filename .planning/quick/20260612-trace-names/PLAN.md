---
status: complete
created: 2026-06-12
---

# Quick Task: Fix trace-start ingest path

## Scope

Trace name support added `traceStarts`, but the ingest route and service path do not carry the new event array through to the event bus/consumer consistently.

## Tasks

1. Thread `traceStarts` through `/api/v1/ingest`, `ILogService`, and `LogServiceImpl`.
2. Make the ingest consumer resilient to older payloads that omit `traceStarts`.
3. Add focused regression coverage and run the relevant Hono tests.

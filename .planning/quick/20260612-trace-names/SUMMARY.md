---
status: complete
completed: 2026-06-12
---

# Quick Task Summary: Fix trace-start ingest path

## Completed

- Threaded `traceStarts` through the Hono ingest route and log service contract.
- Included trace starts in telemetry idempotency and total-event handling.
- Normalized consumer payload arrays so older batches without `traceStarts` still work.
- Added a consumer regression test for trace-start-only batches.

## Verification

- `bun test src/services/log/internal/materialization/TraceReadModelMaterializer.name.test.ts src/services/log/internal/worker/LogIngestConsumer.test.ts src/services/log/internal/service-impl/LogServiceImpl.test.ts`
- `git diff --check -- ../hono-server/src/index.ts ../hono-server/src/services/log/api/ILogService.ts ../hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts ../hono-server/src/services/log/internal/worker/LogIngestConsumer.ts ../hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts ../hono-server/src/services/log/internal/worker/LogIngestConsumer.test.ts ../.planning/quick/20260612-trace-names/PLAN.md`

## Notes

`bunx tsc --noEmit` still fails in unrelated pre-existing auth/outbox test typing areas.

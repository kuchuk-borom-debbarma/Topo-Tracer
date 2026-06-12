---
status: complete
---

Verified existing SDK + Hono read-model support for trace-level `name` and `importanceLabels`, then closed the remaining Hono self-tracing gap by emitting `traceStarts` from internal request traces so summaries can persist that metadata in read-optimized tables.

Added self-contained Node SDK examples for:
- root trace metadata + manual spans
- async fan-out
- simulated distributed RPC
- simulated async queue handoff
- error propagation
- one `end-to-end-demo.ts` runner that executes all flows sequentially

Also fixed SDK packaging/build issues:
- build now uses `tsc -p tsconfig.json` instead of Bun's browser-target build path
- package metadata now matches emitted ESM files
- ingest URL handling now accepts either a base URL or a full `/api/v1/ingest` URL
- example helper now uses the backend base URL correctly

Validation:
- `bun test tests/integration.test.ts` in `sdks/node-js`
- `bunx tsc --noEmit --module esnext --target esnext --moduleResolution bundler --types bun-types --esModuleInterop --skipLibCheck --strict examples/_helpers.ts examples/basic.ts examples/async-fanout.ts examples/distributed/client.ts examples/distributed/server.ts examples/message-queue.ts examples/error-handling.ts` in `sdks/node-js`
- `bun test src/infra/tracing/InternalTracer.test.ts src/services/log/internal/materialization/TraceReadModelMaterializer.name.test.ts src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` in `hono-server`

Known environment issue:
- `bun run fallow` in `hono-server` fails here because Fallow cannot create its temporary worktree from `HEAD`.
- sandbox blocked local socket listen, so the new demo runner could not be exercised against a temporary mock HTTP collector inside this session.

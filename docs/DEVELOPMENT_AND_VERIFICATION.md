# Development And Verification

Local defaults:

- ClickHouse: `http://localhost:8123`
- Backend: `http://localhost:3999`
- Frontend: `http://localhost:5173`
- Frontend API default: `http://localhost:3999`
- SDK/seed default: `http://localhost:3999`

## Start Backend

```sh
cd carno.js
bun run dev
```

Expected:

```text
Carno running on port 3999
```

Backend uses dev CORS:

```ts
cors: {
  origins: "*",
}
```

Check:

```sh
curl -i -H 'Origin: http://localhost:5173' \
  'http://127.0.0.1:3999/telemetry/traces?page=1&limit=20'
```

Look for `HTTP/1.1 200 OK` and `Access-Control-Allow-Origin: *`.

## Start Frontend

```sh
cd frontend
npm run dev
```

Optional override:

```sh
VITE_API_BASE_URL=http://localhost:3999 npm run dev
```

## Run Seed

```sh
cd carno.js
bun run seed
```

Large seed:

```sh
cd carno.js
bun run seed:large
```

Expected:

```text
Trace ready: node_trace_...
```

Worker should log materialization quickly because ingestion publishes
`trace.events.ingested`. Manual fallback:

```sh
curl -X POST 'http://localhost:3999/telemetry/materialize'
```

## Run SDK Examples

From `sdk/nodejs/example`:

```sh
bun run basic_usage.ts
bun run monolith_sync_flow.ts
bun run monolith_deep_nesting.ts
bun run monolith_async_jobs.ts
bun run all_edge_types.ts
bun run distributed_sync_http_rpc.ts
bun run distributed_pubsub_async.ts
bun run distributed_saga_compensation.ts
```

Each should print:

```text
Trace ID: ...
Open frontend and select trace.
```

## Build Checks

Backend bundle:

```sh
cd carno.js
bun run check
```

Backend typecheck note:

```sh
cd carno.js
./node_modules/.bin/tsc --noEmit
```

Current full `tsc` reports errors inside `@carno.js/core/src`; local source has
no additional errors after those dependency errors.

Frontend:

```sh
cd frontend
npm run build
```

SDK:

```sh
cd sdk/nodejs
npm run build
```

## Smoke Checks

List traces:

```sh
curl -s 'http://localhost:3999/telemetry/traces?limit=3'
```

Fetch graph:

```sh
curl -s 'http://localhost:3999/telemetry/traces/{traceId}/graph?maxImportance=0&limit=10'
```

Expected:

- `metadata.returnedNodeCount <= 10`
- `metadata.hiddenNodeCount > 0` on large trace at low detail
- `metadata.ghostNodeCount > 0` when hidden nodes exist
- nodes include `importanceLevel`
- ghost nodes include `hiddenNodeCount`

Frontend expected:

- Trace rail loads.
- Graph header stats update.
- Importance slider changes detail level.
- Graph columns read `i0`, `i1`, etc.
- Node cards show status, importance, duration, and time range.
- Arrows have labels.
- Inspector shows id, status, endpoints for edges, timing, diagnostics, JSON.

Bad signs:

- Browser console has `NaN` style/SVG warnings.
- Trace list is empty after seed and materialize.
- Graph request returns more than 500 nodes.
- Backend logs repeated event handler failures.

## Environment Variables

Backend:

- `PORT`: backend port, default `3999`.
- `CLICKHOUSE_HOST`: default `http://localhost:8123`.
- `CLICKHOUSE_USER`: default `default`.
- `CLICKHOUSE_PASSWORD`: default `password`.
- `EVENT_BUS_IDEMPOTENCY_TTL_MS`: in-memory event dedupe TTL, default `600000`.
- `TRACE_MATERIALIZER_BATCH_SIZE`: dirty trace batch size, default `50`.
- `TRACE_MATERIALIZER_RECOVERY_INTERVAL_MS`: recovery scan interval, default
  `30000`; set `0` to disable.
- `TRACE_MATERIALIZER_INTERVAL_MS`: legacy fallback for recovery interval.

Frontend:

- `VITE_API_BASE_URL`: backend URL, default `http://localhost:3999`.

SDK/seed:

- `TOPO_TRACER_URL`: backend URL, default `http://localhost:3999`.

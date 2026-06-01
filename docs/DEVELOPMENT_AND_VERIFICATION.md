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

Backend CORS is open for dev:

```ts
cors: {
  origins: "*",
}
```

If browser says `CORS request did not succeed` with status `(null)`, backend is
usually stopped or the frontend points at wrong port.

Check:

```sh
curl -i -H 'Origin: http://localhost:5173' \
  'http://127.0.0.1:3999/telemetry/traces?page=1&limit=20'
```

Look for:

```text
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
```

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

Normal seed:

```sh
cd carno.js
bun run seed
```

Large seed:

```sh
cd carno.js
bun run seed:large
```

Expected seed output:

```text
Trace ready after materializer: node_trace_...
```

Materializer should later log:

```text
Materialized node_trace_...: 10500 nodes, 10499 edges, max importance 4
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
Open frontend and select trace after materializer runs.
```

If an example logs `Failed to flush telemetry`, backend is not reachable at
`TOPO_TRACER_URL` or default `http://localhost:3999`.

## Build Checks

Backend:

```sh
cd carno.js
bun run check
```

Frontend:

```sh
cd frontend
npm run build -- --mode development
```

SDK:

```sh
cd sdk/nodejs
npm run build
```

SDK examples typecheck:

```sh
cd sdk/nodejs
./node_modules/.bin/tsc --noEmit --ignoreConfig \
  --target ES2022 \
  --module CommonJS \
  --moduleResolution node \
  --esModuleInterop \
  --strict \
  --skipLibCheck \
  --types node \
  --ignoreDeprecations 6.0 \
  example/*.ts src/*.ts
```

## Graph Window Smoke Checks

List traces:

```sh
curl -s 'http://localhost:3999/telemetry/traces?limit=3'
```

Fetch a low-detail large trace:

```sh
curl -s 'http://localhost:3999/telemetry/traces/{traceId}/graph?maxImportance=0&limit=10'
```

Check response has:

- `metadata.returnedNodeCount <= 10`
- `metadata.hiddenNodeCount > 0` for large trace
- `metadata.ghostNodeCount > 0`
- nodes include `importanceLevel`
- nodes include `indentLevel`
- ghost nodes include `hiddenNodeCount`

## Frontend Smoke Checks

Open frontend and select latest trace.

Expected:

- Trace list loads.
- Toolbar says `Importance <=`.
- Large trace renders capped node window.
- Node cards show `indent`, `importance`, duration, and time range.
- Ghost cards show hidden count and hidden duration.
- Arrows have labels.
- Inspector shows id, status, started, ended, duration, diagnostics, metadata.

Bad signs:

- Browser console has `NaN` style/SVG warnings.
- Trace list says empty after seed and materializer.
- `CORS request did not succeed` with status `(null)`.
- Graph request returns more than 500 nodes.

## Environment Variables

Backend:

- `PORT`: backend port, default `3999`.
- `CLICKHOUSE_HOST`: default `http://localhost:8123`.
- `CLICKHOUSE_USER`: default `default`.
- `CLICKHOUSE_PASSWORD`: default `password`.
- `TRACE_MATERIALIZER_INTERVAL_MS`: default `5000`.

Frontend:

- `VITE_API_BASE_URL`: backend URL, default `http://localhost:3999`.

## Graph Page

Trace list is at `/`.

Dedicated graph view is:

```text
/traces/{traceId}/graph
```

Graph edge styling:

- Solid green edge: completed causal edge.
- Solid amber edge with `open` label: async/fire-and-forget edge without
  `edge.ended`.
- Dashed gray edge: ghost edge created by collapsing hidden nodes.
- Compact edge chip on node: relationship returns to a parent column, points
  backward, or is outside current graph window, so UI avoids drawing a faraway
  comeback arrow.
- Parent/child `continues` edges are hidden as arrows. Columns already show that
  structure, and quiet scope lines connect parent to child. Only explicit work
  edges should visually connect cards as operation arrows.

If graph metadata says `0 hidden` and `0 ghosts`, there should be no dashed
ghost edges. Open async edges should still be visible as solid amber.

SDK/seed:

- `TOPO_TRACER_URL`: backend URL, default `http://localhost:3999`.

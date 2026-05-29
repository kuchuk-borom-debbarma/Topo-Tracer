# Topo-Tracer Web

Production-oriented static web console for `carno.js`.

## Run

```bash
bun run dev
```

Open `http://localhost:5173`.

## Capabilities

- Live trace list from `GET /telemetry/traces`
- Paginated previous/next trace navigation
- Trace detail from `GET /telemetry/trace/:traceId/full`
- Multi-resolution depth slider with `global` and `local` depth modes
- Flow, container, timeline, and raw JSON views
- Offline JSON import for trace payloads shaped like `{ nodes, edges, visualWires? }`
- PDF export through browser print/save

No runtime dependencies are required beyond Bun and browser APIs.

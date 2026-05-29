# Agent Context

Use this file as a fast handoff before changing Topo-Tracer.

## Repository Shape

```text
.
├── carno.js/          # Backend API, ClickHouse persistence, materialization engine
├── sdk/nodejs/        # Node.js instrumentation SDK
├── docs/              # Product specs and architecture notes
├── docker-compose.yml # ClickHouse + Redpanda infra
└── visualizer.html    # Standalone visualizer artifact
```

Current git status may include deleted `frontend/*` files. Do not restore or revert them unless user asks.

## Backend Truth

Source of truth for backend behavior:

- `carno.js/src/index.ts`
- `carno.js/src/routes/LogController.ts`
- `carno.js/src/infra/ClickHouseService.ts`
- `carno.js/src/services/log/internal/repo-impls/LogRepoClickHouseImpl.ts`
- `carno.js/src/services/log/internal/listeners/*`

Backend runs on port `3000`. ClickHouse defaults to `http://localhost:8123`, user `default`, password `password`.

Actual ClickHouse database name is `toco_tracer`.

## Current API Surface

| Method | Path |
| --- | --- |
| `GET` | `/` |
| `GET` | `/test` |
| `POST` | `/telemetry/containers` |
| `POST` | `/telemetry/nodes` |
| `POST` | `/telemetry/edges` |
| `POST` | `/telemetry/containers/update-times` |
| `POST` | `/telemetry/nodes/update-times` |
| `POST` | `/telemetry/edges/update-times` |
| `GET` | `/telemetry/trace/:traceId` |
| `GET` | `/telemetry/trace/:traceId/full` |
| `GET` | `/telemetry/trace/:traceId/metadata` |
| `GET` | `/telemetry/traces` |

Trace reads support `depthType=global|local`. Global uses `depthIndex`; local uses `localDepthIndex`.

## Materialization Pipeline

Node and edge writes trigger `trace_materialization`.

Pipeline:

1. `TraceNodeResolver`: writes `node_ancestry`.
2. `TraceEdgeResolver`: writes `edge_egress_ancestry`.
3. `TraceClosureBuilder`: writes sparse `read_edges` rows and sets `trace_metadata.is_zoom_ready`.

`read_edges` stores `depth_type`, `visual_depth`, `from_target_*`, and `to_target_*`. Query code uses `visual_depth <= depth ORDER BY visual_depth DESC LIMIT 1 BY edge_id`.

## Important Caveats

- Redpanda exists in `docker-compose.yml`, but backend currently uses `InMemoryMessageBroker`.
- Materialization debounce is process-local and best effort.
- No durable queue, replay, or cross-instance idempotency is implemented.
- No `read_layouts`, tenant baggage index, fleet aggregate table, or UI container layout cache exists in backend code.
- Top-level roadmap docs are forward-looking when they mention those missing tables/features.

## Docs To Trust First

- `carno.js/README.md`
- `carno.js/docs/Trace_Materialization_Engine.md`
- `docs/architecture/multi-resolution-zoom-engine.md`
- This file

Older product specs may contain aspirational language. Verify claims against `carno.js/src` before implementing.

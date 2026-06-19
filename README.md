# Topo-Tracer

Topo-Tracer is a graph-first tracing system for inspecting large execution traces without forcing the backend or UI to load the full graph at once.

The active backend is `hono-server`. It accepts explicit node and edge lifecycle events, stores the raw event stream in ClickHouse, materializes read-optimized trace state, and serves bounded graph projections that the React UI can render by importance threshold.

## Why It Exists

Most tracing tools model a request as a tree of spans. Topo-Tracer models it as a directed graph:

- nodes are units of work, logs, database calls, API calls, or internal backend spans;
- edges are explicit causal links between nodes;
- importance levels decide what should stay visible at each zoom level;
- hidden low-priority runs collapse into ghost nodes so the graph keeps its shape;
- every read API is bounded, cursor-aware, and designed to avoid million-node responses.

That model is useful when a trace has fan-out, queues, retries, distributed work, or a lot of low-value detail. Backend engineers can keep the critical path visible while still preserving the detail for drill-down.

## Current Features

- Authenticated telemetry ingestion through `POST /api/v1/ingest`.
- JWT login plus SDK-friendly API keys.
- Append-only trace, node, and edge event ingestion.
- ClickHouse raw event tables for high-write telemetry storage.
- Incremental read-model materialization with explicit checkpoints.
- Deterministic `flowOrder` computation over explicit graph edges.
- Clock-skew correction for causal timestamp violations.
- Trace summary diagnostics for missing starts, missing ends, negative durations, cycles, orphan edges, invalid importance, clock skew, and size limits.
- Bounded trace listing and summary reads.
- Bounded flow projection with cursor paging, hard caps, and stale-cursor detection.
- Importance-threshold graph projection with ghost nodes and edge aggregation.
- Backend self-tracing via request tracing middleware.
- React trace explorer using React Flow.
- Node.js SDK with batching, retry, AsyncLocalStorage context, logs-as-nodes, and demo traces.

## Architecture At A Glance

```mermaid
flowchart LR
  SDK["Node SDK / Client"] -->|"POST /api/v1/ingest"| Hono["Hono routes"]
  Hono -->|"log.telemetry.received"| Bus["IEventBus"]
  Bus --> Ingest["LogIngestConsumer"]
  Ingest -->|"append raw rows"| Raw["ClickHouse raw events"]
  Ingest -->|"log.trace.ingested"| MatSignal["Trace rebuild signal"]
  MatSignal --> Agg["ReadOptimisedAggregator"]
  Agg --> Materializer["TraceReadModelMaterializer"]
  Materializer -->|"load checkpoint + raw events"| Raw
  Materializer -->|"save read model + checkpoint"| Read["ClickHouse read tables"]
  UI["React UI"] -->|"GET /api/v1/traces/:id/flow"| Projector["LogFlowProjector"]
  Projector --> Read
```

The important backend boundary is this: ingestion records facts, materialization builds queryable state, and projection shapes a bounded UI response. Those responsibilities live in separate modules so each can evolve without turning the route handler into the system.

## Repository Layout

```txt
hono-server/        Active Hono backend and read-model pipeline
frontend/           React trace explorer
sdks/node-js/       Node.js instrumentation SDK and examples
sdks/java/          Java/Spring SDK docs and package skeleton
docs/               Backend architecture, pipeline, API, and development docs
```

The old `carno.js` backend is not part of this repository layout anymore. New backend behavior belongs in `hono-server/src`.

## Backend Entry Points

- `hono-server/src/index.ts` wires middleware, routes, startup bootstrapping, consumers, and shutdown.
- `hono-server/src/services/log/api/ILogService.ts` is the public trace service contract.
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` validates ingestion and coordinates trace reads.
- `hono-server/src/services/log/internal/worker/LogIngestConsumer.ts` writes received telemetry batches to ClickHouse.
- `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.ts` coalesces trace rebuild work.
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` folds raw events into read models.
- `hono-server/src/services/log/internal/projection/LogFlowProjector.ts` turns materialized graph state into the UI response.
- `hono-server/src/infra/db/clickhouse/schema.ts` defines raw, read, summary, checkpoint, and realtime summary tables.

## Local Development

Start dependencies:

```sh
# ClickHouse default expected by the backend
http://localhost:8123

# Postgres default expected by the backend
postgres://postgres:password@localhost:5432/topo_tracer
```

Run the backend:

```sh
cd hono-server
bun install
bun run dev
```

Run the frontend:

```sh
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8787 npm run dev
```

Run backend tests:

```sh
cd hono-server
bun test
```

Run the Node SDK demo after creating an API key in the UI:

```sh
cd sdks/node-js
bun install
TOPO_TRACER_URL=http://localhost:8787 bun run demo:e2e
```

## Documentation Map

- [Documentation index](./docs/README.md)
- [System overview](./docs/1.system_architecture/1.1.system_overview.md)
- [API contracts](./docs/1.system_architecture/1.2.api_contracts.md)
- [Ingestion and outbox](./docs/2.trace_pipeline/2.1.ingestion_and_outbox.md)
- [Materialization engine](./docs/2.trace_pipeline/2.2.materialization_engine.md)
- [Graph projection](./docs/2.trace_pipeline/2.3.graph_projection.md)
- [Database schemas](./docs/3.backend_infrastructure/3.1.database_schemas.md)
- [Event bus and idempotency](./docs/3.backend_infrastructure/3.2.event_bus_and_idempotency.md)
- [Hono codebase guide](./docs/6.hono_server/6.1.codebase.md)

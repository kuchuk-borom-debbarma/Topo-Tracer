# carno.js Backend

`carno.js` is the Topo-Tracer telemetry backend. It accepts flat telemetry rows from the SDK, stores them in ClickHouse, and asynchronously materializes read-optimized visual wires for multi-resolution trace views.

## Runtime

- HTTP framework: `@carno.js/core`
- Database: ClickHouse HTTP client
- Local message broker: in-process `InMemoryMessageBroker`
- Default server port: `3000`
- Database namespace: `toco_tracer`

## Setup

Start infrastructure from the repository root:

```bash
docker compose up -d clickhouse
```

Install and run backend:

```bash
cd carno.js
bun install
bun run dev
```

ClickHouse config defaults:

| Variable | Default |
| --- | --- |
| `CLICKHOUSE_HOST` | `http://localhost:8123` |
| `CLICKHOUSE_USER` | `default` |
| `CLICKHOUSE_PASSWORD` | `password` |

`ClickHouseService` creates/updates all required tables on application boot.

## API

Base URL: `http://localhost:3000`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Health-ish hello string. |
| `GET` | `/test` | Inserts one test container row. |
| `POST` | `/telemetry/containers` | Batch insert containers. |
| `POST` | `/telemetry/nodes` | Batch insert execution nodes and trigger materialization. |
| `POST` | `/telemetry/edges` | Batch insert cross-container edges and trigger materialization. |
| `POST` | `/telemetry/containers/update-times` | Shift container timestamps in memory; does not mutate ClickHouse. |
| `POST` | `/telemetry/nodes/update-times` | Shift node timestamps while preserving relative offsets. |
| `POST` | `/telemetry/edges/update-times` | Shift edge timestamps while preserving relative offsets. |
| `GET` | `/telemetry/trace/:traceId` | Paginated trace read. Query: `limit`, `depth`, `depthType`, `beforeTime`, `beforeId`, `afterTime`, `afterId`. |
| `GET` | `/telemetry/trace/:traceId/full` | Full trace read, optional `depth` and `depthType`. |
| `GET` | `/telemetry/trace/:traceId/metadata` | Materialization state and max depths. |
| `GET` | `/telemetry/traces` | Paginated trace summaries. Query: `limit`, `beforeTime`, `afterTime`. |

`depthType` is `global` or `local`. `global` uses `depthIndex`; `local` uses `localDepthIndex`.

## Data Flow

1. SDK posts containers, nodes, and edges to `/telemetry/*`.
2. `LogServiceImpl` enriches defaults and delegates to `LogRepoClickHouseImpl`.
3. `LogRepoClickHouseImpl` writes append-only rows into ClickHouse.
4. Node/edge writes publish `trace_materialization` messages through `MessageBroker`.
5. `TraceMaterializationListener` runs three stages:
   - `TraceNodeResolver`: writes `node_ancestry`.
   - `TraceEdgeResolver`: writes `edge_egress_ancestry`.
   - `TraceClosureBuilder`: writes sparse `read_edges` rows and marks `trace_metadata.is_zoom_ready`.
6. Read APIs return nodes/edges plus `visualWires` when a depth filter is requested.

## Current Production Caveat

`docker-compose.yml` includes Redpanda, but the application currently wires `MessageBroker` to `InMemoryMessageBroker`. Multi-process idempotency and durable materialization events require a real broker implementation before horizontal production deployment.

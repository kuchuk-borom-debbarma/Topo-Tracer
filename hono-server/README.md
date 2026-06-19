# Topo-Tracer Hono Server

`hono-server` is the active backend for Topo-Tracer. It owns authentication, telemetry ingestion, event-driven materialization, ClickHouse read models, and bounded trace read APIs.

## What This Backend Does

- Authenticates users with JWTs and SDKs with `X-API-Key`.
- Accepts trace, node, and edge lifecycle batches at `POST /api/v1/ingest`.
- Publishes ingestion work through the `IEventBus` abstraction.
- Persists raw telemetry into ClickHouse append-only tables.
- Rebuilds trace read models from explicit checkpoints.
- Computes deterministic graph `flowOrder` from explicit edges.
- Corrects causal clock-skew violations during materialization.
- Serves trace lists, trace summaries, and bounded graph flow projections.
- Excludes backend self-tracing from normal user trace lists.

## Runtime Shape

```txt
src/index.ts
  -> requestTracingMiddleware
  -> ClickHouse/Postgres bootstrap middleware
  -> auth routes
  -> ingest route
  -> trace read/delete routes
  -> background consumers
```

The route handlers are intentionally thin. Most backend behavior lives under `src/services/log` and `src/services/auth`; database and broker details live under `src/infra`.

## Trace Pipeline

1. `POST /api/v1/ingest` validates a batch and calls `logService.ingestNodesNEdges`.
2. `LogServiceImpl` publishes `log.telemetry.received` with a deterministic idempotency id.
3. `LogIngestConsumer` consumes that topic and appends raw trace, node, and edge rows to ClickHouse.
4. The ingest consumer emits `log.trace.ingested` once per affected trace.
5. `ReadOptimisedAggregator` coalesces duplicate trace rebuild signals and limits rebuild concurrency.
6. `TraceReadModelMaterializer` loads the previous checkpoint and read model, replays newer raw events, computes flow order and diagnostics, saves read tables, then saves the new checkpoint.
7. `GET /api/v1/traces/:traceId/flow` reads materialized nodes/edges and uses `LogFlowProjector` to return an importance-filtered graph window.

## Main Source Files

- `src/index.ts`: Hono app, routes, bootstrapping, consumer startup, graceful shutdown.
- `src/services/log/api/ILogService.ts`: trace service API.
- `src/services/log/api/types.ts`: ingest, read-model, projection, and paging types.
- `src/services/log/internal/service-impl/LogServiceImpl.ts`: ingestion orchestration and read APIs.
- `src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts`: raw event appends.
- `src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`: checkpoints, read model reads/writes, projection reads, deletion.
- `src/services/log/internal/materialization/TraceReadModelMaterializer.ts`: raw-to-read model folding.
- `src/services/log/internal/materialization/flowOrder.ts`: deterministic topological ordering.
- `src/services/log/internal/projection/LogFlowProjector.ts`: threshold and ghost-node projection.
- `src/infra/db/clickhouse/schema.ts`: ClickHouse tables and materialized views.
- `src/infra/event-bus`: dev/Kafka bus, idempotency, and outbox infrastructure.
- `src/infra/tracing`: backend self-tracing and W3C `traceparent` handling.

## Endpoints

Authenticated trace endpoints accept either `Authorization: Bearer <jwt>` or `X-API-Key: <key>`.

```txt
POST   /api/v1/auth/signup/start
POST   /api/v1/auth/signup/finish
POST   /api/v1/auth/login
GET    /api/v1/auth/me
GET    /api/v1/auth/api-keys
POST   /api/v1/auth/api-keys
DELETE /api/v1/auth/api-keys/:apiKeyId
POST   /api/v1/auth/reset-password/start
POST   /api/v1/auth/reset-password/finish

POST   /api/v1/ingest
GET    /api/v1/traces
GET    /api/v1/traces/:traceId/summary
GET    /api/v1/traces/:traceId/flow
DELETE /api/v1/traces/:traceId
```

## Local Run

The server expects ClickHouse and Postgres locally unless overridden.

```sh
bun install
bun run dev
```

Wrangler serves the Worker at `http://localhost:8787` by default. `src/bun.ts` can run the same Hono app with Bun on `PORT` or `3999`, but the package script currently uses Wrangler.

## Environment

```txt
CLICKHOUSE_URL          default http://localhost:8123
CLICKHOUSE_USERNAME     default default
CLICKHOUSE_PASSWORD     default password in direct bootstrap, empty in Hono binding fallback
CLICKHOUSE_DATABASE     default default
POSTGRES_URL            default postgres://postgres:password@localhost:5432/topo_tracer
JWT_SECRET              JWT signing and verification secret
EVENT_BUS_TYPE          set to kafka to use KafkaEventBus, otherwise DevEventBus
KAFKA_BROKERS           comma-separated brokers, default localhost:9092
DISABLE_SELF_TRACING    true disables backend self-trace publishing
OUTBOX_POLL_INTERVAL_MS default 2000
OUTBOX_BATCH_SIZE       default 100
OUTBOX_MAX_BACKOFF_MS   default 60000
OUTBOX_LOCK_EXPIRY_MS   default 300000
```

## Verification

```sh
bun test
bun run fallow
bun x tsc --noEmit
```

The test suite covers route validation, auth, event bus behavior, outbox relay resilience, ClickHouse schema/repository mapping, materialization, flow ordering, projection, cursor encoding, and trace deletion.

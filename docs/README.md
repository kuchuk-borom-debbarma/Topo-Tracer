# Topo-Tracer Documentation

This directory is the backend-oriented documentation set for Topo-Tracer.

Topo-Tracer is a graph-first tracing system. The active backend lives in `hono-server`; it ingests explicit node and edge lifecycle events, stores raw telemetry in ClickHouse, materializes read-optimized graph state, and serves bounded graph projections to the UI.

## Recommended Reading Path

1. Start with the root [README](../README.md) for the product and repository overview.
2. Read [1.1. System Overview](./1.system_architecture/1.1.system_overview.md) to understand the backend architecture.
3. Read [2.1. Ingestion and Outbox](./2.trace_pipeline/2.1.ingestion_and_outbox.md), [2.2. Materialization Engine](./2.trace_pipeline/2.2.materialization_engine.md), and [2.3. Graph Projection](./2.trace_pipeline/2.3.graph_projection.md) for the trace pipeline.
4. Use [3.1. Database Schemas](./3.backend_infrastructure/3.1.database_schemas.md) and [3.2. Event Bus and Idempotency](./3.backend_infrastructure/3.2.event_bus_and_idempotency.md) when changing storage or async behavior.
5. Use [6.1. Hono Codebase Guide](./6.hono_server/6.1.codebase.md) before editing `hono-server/src`.

## 1. System Architecture

- [1.1. System Overview](./1.system_architecture/1.1.system_overview.md)
- [1.2. API Contracts](./1.system_architecture/1.2.api_contracts.md)

## 2. Trace Pipeline

- [2.1. Ingestion and Outbox](./2.trace_pipeline/2.1.ingestion_and_outbox.md)
- [2.2. Materialization Engine](./2.trace_pipeline/2.2.materialization_engine.md)
- [2.3. Graph Projection](./2.trace_pipeline/2.3.graph_projection.md)

## 3. Backend Infrastructure

- [3.1. Database Schemas](./3.backend_infrastructure/3.1.database_schemas.md)
- [3.2. Event Bus and Idempotency](./3.backend_infrastructure/3.2.event_bus_and_idempotency.md)

## 4. Development Guide

- [4.1. Local Setup and Verification](./4.development_guide/4.1.local_setup_and_verification.md)
- [4.2. Codebase Conventions](./4.development_guide/4.2.codebase_conventions.md)

## 6. Hono Server

- [6.1. Hono Codebase Guide](./6.hono_server/6.1.codebase.md)

## 7. Node.js SDK

- [7.1. Distributed Tracing](./7.node_js_sdk/7.1.distributed_tracing.md)
- [7.2. Example Traces](./7.node_js_sdk/7.2.example_traces.md)
- [7.3. Performance Tuning](./7.node_js_sdk/7.3.performance_tuning.md)

## 8. Java and Spring SDK

- [8.1. Java and Spring Integration](./8.java_sdk/8.1.java_and_spring.md)

## 9. Development Journal

- [9.1. ClickHouse Checkpoint Lookback Journal](./9.development_journal/9.1.clickhouse_checkpoint_lookback.md)

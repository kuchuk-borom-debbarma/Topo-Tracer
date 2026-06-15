# Topo-Tracer Documentation

Topo-Tracer is a primitive node-to-node trace graph ingestion and projection backend built on Hono, Postgres, and ClickHouse.

This directory serves as the master index for all project documentation. Following strict documentation rules, all manuals here accurately reflect the active architecture.

## 1. System Architecture
High-level overview of the application and its external API contracts.
- [1.1. System Overview](./1.system_architecture/1.1.system_overview.md)
- [1.2. API Contracts](./1.system_architecture/1.2.api_contracts.md)

## 2. Trace Pipeline
The deep-dive into how trace data flows from HTTP to the UI.
- [2.1. Ingestion & Outbox](./2.trace_pipeline/2.1.ingestion_and_outbox.md)
- [2.2. Materialization Engine](./2.trace_pipeline/2.2.materialization_engine.md)
- [2.3. Graph Projection](./2.trace_pipeline/2.3.graph_projection.md)

## 3. Backend Infrastructure
The storage and asynchronous message processing layers.
- [3.1. Database Schemas](./3.backend_infrastructure/3.1.database_schemas.md)
- [3.2. Event Bus & Idempotency](./3.backend_infrastructure/3.2.event_bus_and_idempotency.md)

## 4. Development Guide
Guidelines for developers working on the `hono-server` backend.
- [4.1. Local Setup & Verification](./4.development_guide/4.1.local_setup_and_verification.md)
- [4.2. Codebase Conventions](./4.development_guide/4.2.codebase_conventions.md)

## 7. Node.js SDK
Guides for consumers instrumenting their applications with the Topo-Tracer SDK.
- [7.1. Distributed Tracing](./7.node_js_sdk/7.1.distributed_tracing.md)
- [7.2. Example Traces](./7.node_js_sdk/7.2.example_traces.md)
- [7.3. Performance Tuning](./7.node_js_sdk/7.3.performance_tuning.md)

## 8. Java & Spring SDK
Documentation for the Java client and its Spring Boot auto-configuration.
- [8.1. Java & Spring Integration](./8.java_sdk/8.1.java_and_spring.md)

## 9. Development Journal
Chronological records of key engineering decisions, diagnostics, and implementations.
- [9.1. ClickHouse Checkpoint Lookback Journal](./9.development_journal/9.1.clickhouse_checkpoint_lookback.md)


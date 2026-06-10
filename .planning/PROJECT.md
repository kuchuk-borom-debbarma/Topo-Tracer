# Project: Topo-Tracer Node.js SDK

## Overview
A lightweight, custom Node.js SDK for structured tracing, designed to ingest lifecycle events (nodes and edges) into the Topo-Tracer Hono server.

## Context
- **Backend:** Hono-based server with ClickHouse and Postgres.
- **Goal:** Provide a developer-friendly API for instrumenting Node.js applications with structured traces.
- **Key Concepts:** Nodes (start/end), Edges (start/end), TraceID, Importance Levels.

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js
- **Communication:** HTTP/REST with JSON payload.
- **Auth:** API Key based.

## Constraints
- **No OTel:** Custom implementation as requested.
- **Efficiency:** Batching and asynchronous sending to minimize impact on application performance.
- **Reliability:** Retry logic for transient network failures.

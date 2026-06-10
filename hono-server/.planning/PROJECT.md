# Project: Trace Flow Endpoint

## Overview
Introduce a new read endpoint `/api/v1/traces/:traceId/flow` in the `hono-server` to provide a paginated, read-optimized view of a specific trace's flow.

## Context
- **Codebase:** `hono-server` (Hono, Bun, TypeScript, ClickHouse, Postgres).
- **Architecture:** Contract-first, service-oriented. Business logic in `services`, persistence in `repo`, infrastructure in `infra`.
- **Existing Logic:** `ILogService` has `projectTraceGraph` which already implements some pagination and threshold-based projection.
- **Goal:** Provide a dedicated `/flow` endpoint that leverages existing read-optimized materialized tables and supports pagination (limit, offset/cursor) and importance filtering.

## Stakeholders
- Backend Engineers (Implementing the endpoint)
- API Consumers (Using the endpoint to visualize trace flows)

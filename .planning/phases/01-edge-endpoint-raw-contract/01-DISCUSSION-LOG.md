# Phase 1: Edge Endpoint Raw Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 1-Edge Endpoint Raw Contract
**Areas discussed:** Edge data shape, lifecycle timestamps, invalid edge handling, schema migration

---

## Edge Data Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoints only in `data` | Store `fromNodeId` and `toNodeId` as map values only. | |
| Explicit endpoint columns | Store `fromNodeId` and `toNodeId` as canonical graph columns. | ✓ |
| Explicit columns plus `data` map | Store graph endpoints explicitly and add edge `data Map(String, String)` for payload symmetry. | ✓ |

**User's choice:** Explicit endpoint columns plus edge `data`.
**Notes:** The user first asked for endpoint data inside edge event `data`, then
agreed endpoints should also be explicit columns because they are graph shape,
not loose metadata.

---

## Lifecycle Timestamps

| Option | Description | Selected |
|--------|-------------|----------|
| Generic `timestamp_ms` | Keep one timestamp column and infer meaning from `event_type`. | |
| Explicit lifecycle columns | Use nullable `started_at_ms` and `ended_at_ms` with `event_type`. | ✓ |
| Unified node/edge rows | Replace start/end arrays with one complete lifecycle object. | |

**User's choice:** Keep `event_type` and use explicit lifecycle timestamp
columns.
**Notes:** Start events require `startedAt`; end events require `endedAt`. Open
lifecycles are represented by only having a start row. Later read models combine
start and end rows into complete node/edge state.

---

## Invalid Edge Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Reject missing only | Require non-empty endpoint fields, allow self-edges, diagnose unknown node ids later. | ✓ |
| Reject missing and self-edge | Require non-empty endpoint fields and reject `fromNodeId === toNodeId`. | |
| Store and diagnose later | Accept any strings and let read materialization handle all invalidity. | |

**User's choice:** Reject missing only.
**Notes:** Unknown node ids should not be rejected in Phase 1 because node events
may arrive later or in a different batch.

---

## Schema Migration

| Option | Description | Selected |
|--------|-------------|----------|
| New dev schema only | Update schema directly; no migration path. | ✓ |
| Backward-compatible migration | Add migration logic for existing local ClickHouse tables. | |

**User's choice:** New dev schema only.
**Notes:** The Hono schema is still development-mode, so no migration is
required.

---

## the agent's Discretion

- Exact field ordering and comments can follow local code style.
- Endpoint columns can be nullable at the ClickHouse level for end rows, while
  start input validation still requires non-empty endpoints.

## Deferred Ideas

- Endpoint existence validation belongs in read materialization diagnostics.
- Read tables, materialization, ghost projection, and HTTP read routes stay out
  of Phase 1.

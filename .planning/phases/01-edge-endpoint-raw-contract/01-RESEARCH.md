# Phase 1: Edge Endpoint Raw Contract - Research

**Researched:** 2026-06-04 [VERIFIED: init.phase-op]
**Domain:** Hono log ingestion contract, ClickHouse raw edge event schema, append-only write ordering [VERIFIED: .planning/ROADMAP.md]
**Confidence:** HIGH for code edit surface; MEDIUM for ClickHouse DDL until a live ClickHouse schema smoke test runs [VERIFIED: codebase grep] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree]

<user_constraints>
## User Constraints (from CONTEXT.md)

All content in this block is copied from `.planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md`. [VERIFIED: codebase grep]

### Locked Decisions

### Edge Endpoint Fields

- **D-01:** Edge start events must include explicit `fromNodeId` and `toNodeId`
  fields.
- **D-02:** `fromNodeId` and `toNodeId` are canonical graph fields, not just
  loose metadata inside `data`.
- **D-03:** The raw edge event table should persist endpoint fields as explicit
  ClickHouse columns, using `from_node_id` and `to_node_id`.
- **D-04:** Edge start ingestion should reject missing or empty endpoint fields.
  It should not validate whether those node ids already exist, because node
  events may arrive in another batch or order.
- **D-05:** Self-edges are allowed in this phase. Missing endpoints are rejected;
  unknown endpoints are diagnosed later by read materialization.

### Edge Data

- **D-06:** Edge events need a `data` payload like node events.
- **D-07:** Raw edge event rows should store `data Map(String, String)`.
- **D-08:** `data` may include user payload and can also carry endpoint-related
  context, but graph projection must use the explicit endpoint columns.

### Lifecycle Shape

- **D-09:** Keep `event_type` on raw node and edge event rows.
- **D-10:** Start events require `startedAt`; end events require `endedAt`.
- **D-11:** Open lifecycles are represented by having only a start row. Do not
  create an end row without `endedAt`.
- **D-12:** Raw tables should use separate lifecycle timestamp columns:
  `started_at_ms Nullable(UInt64)` and `ended_at_ms Nullable(UInt64)`.
- **D-13:** Start rows set `started_at_ms` and leave `ended_at_ms` null. End
  rows set `ended_at_ms` and leave `started_at_ms` null.
- **D-14:** The read-optimized materializer in later phases will combine start
  and end rows into complete node and edge state.

### Schema Handling

- **D-15:** No ClickHouse migration path is required for this phase because the
  Hono schema is still development-mode and can be recreated directly.

### the agent's Discretion

- The planner may choose exact TypeScript field ordering and comment wording as
  long as public types stay plain, readable, and aligned with
  `hono-server/src/code-base.md`.
- The planner may decide whether to keep endpoint columns nullable in ClickHouse
  for end rows, but start-row validation must require non-empty endpoint values.

### Deferred Ideas (OUT OF SCOPE)

- Validating whether endpoint node ids exist is deferred to read
  materialization diagnostics because source events may arrive out of order.
- Read tables, checkpoints, materialization, and ghost projection are deferred
  to later phases.
- HTTP routes/endpoints remain out of scope for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSCH-01 | Hono edge start ingestion data includes `fromNodeId` and `toNodeId` so read edges can connect two explicit graph nodes. [VERIFIED: .planning/REQUIREMENTS.md] | Update `IngestEdgeStart` in `hono-server/src/services/log/api/types.ts`, add runtime validation in `LogServiceImpl`, and prove missing/empty endpoint starts fail before persistence. [VERIFIED: codebase grep] |
| RSCH-02 | Raw ClickHouse edge event rows persist `from_node_id` and `to_node_id` for edge start events. [VERIFIED: .planning/REQUIREMENTS.md] | Update `EdgeEventRow`, edge table DDL, and `LogWriteRepoClickHouse.buildEdgeRows`; verify inserted JSONEachRow values contain endpoint columns. [VERIFIED: codebase grep] [CITED: https://clickhouse.com/docs/integrations/javascript] |
</phase_requirements>

## Summary

Phase 1 is a contract/schema correction inside `hono-server` only: edge start inputs must expose `fromNodeId`, `toNodeId`, and `data`, and raw edge rows must carry those values in explicit ClickHouse columns. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] The implementation should not add HTTP routes, read tables, materializers, endpoint existence checks, or ghost projection logic. [VERIFIED: .planning/REQUIREMENTS.md]

The current code already has the right module boundaries: public log input types live in `services/log/api/types.ts`, service orchestration lives in `LogServiceImpl`, repo-private row types live in `services/log/internal/repo/types.ts`, ClickHouse DDL lives in `infra/db/clickhouse/schema.ts`, and JSONEachRow inserts are isolated in `LogWriteRepoClickHouse`. [VERIFIED: codebase grep] The plan should extend those files rather than introduce a new service, route, database client path, or cross-module internal import. [VERIFIED: hono-server/src/code-base.md]

**Primary recommendation:** Implement one focused Hono-only slice: public edge start type fields, service boundary validation, repo row/schema mapping, focused unit tests with fakes, TypeScript check, Fallow, and a ClickHouse DDL/insert smoke check when ClickHouse is available. [VERIFIED: codebase grep] [CITED: https://clickhouse.com/docs/integrations/javascript]

## Project Constraints (from AGENTS.md)

- Work only in `hono-server` for backend behavior in this project. [VERIFIED: AGENTS.md]
- Read and follow `hono-server/src/code-base.md` before Hono planning or implementation. [VERIFIED: AGENTS.md]
- Use ClickHouse read-optimized storage for trace/read-model data. [VERIFIED: AGENTS.md]
- Treat edges as the only graph links; do not infer graph structure from node ids, ancestry paths, or start order. [VERIFIED: AGENTS.md]
- Use threshold importance semantics later: visible means `importanceLevel <= selectedThreshold`. [VERIFIED: AGENTS.md]
- Read APIs must have hard caps; this phase does not add read APIs. [VERIFIED: AGENTS.md] [VERIFIED: .planning/ROADMAP.md]
- Materialization must resume from checkpoint rows later; this phase must not infer progress from read node or read edge state. [VERIFIED: AGENTS.md] [VERIFIED: .planning/ROADMAP.md]
- Hono services own business logic, repositories own ClickHouse access, and routes stay thin. [VERIFIED: hono-server/src/code-base.md]
- Public service types belong in `api/types.ts`; repo-private row types belong under `internal/repo/types.ts`. [VERIFIED: hono-server/src/code-base.md]
- After code changes under Hono, run `bun run fallow`. [VERIFIED: hono-server/src/code-base.md]
- Follow two-space indentation, semicolons, double quotes, relative imports, and contract-first module structure. [VERIFIED: AGENTS.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Edge start endpoint contract | API / Backend service | Browser / Client later | The service API currently defines `IngestEdgeStart`; no route is in scope for v1, and client work is not part of this phase. [VERIFIED: codebase grep] |
| Missing/empty endpoint rejection | API / Backend service | Repository as defensive guard only | `hono-server/src/code-base.md` assigns business precondition validation to services; repositories should not be the primary validator. [VERIFIED: hono-server/src/code-base.md] |
| Raw edge endpoint persistence | Database / Storage | API / Backend repository | ClickHouse row mapping and inserts are already isolated in `LogWriteRepoClickHouse`, while DDL lives in `infra/db/clickhouse/schema.ts`. [VERIFIED: codebase grep] |
| Publish read-model work after persistence | API / Backend service | Event bus infrastructure | `LogServiceImpl` awaits `writeRepo.ingestNodesNEdges(data)` before publishing `log.trace.ingested`; preserve that order. [VERIFIED: codebase grep] |
| Endpoint existence diagnosis | Deferred materialization tier | Database / Storage later | Context defers unknown endpoint validation to later read materialization diagnostics. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | Local: 4.12.23; npm latest queried: 4.12.23, modified 2026-05-25. [VERIFIED: npm registry] | Hono app framework for `hono-server/src/index.ts`. [VERIFIED: codebase grep] | Existing Hono server package and architecture guide are built around Hono. [VERIFIED: hono-server/src/code-base.md] |
| `@clickhouse/client-web` | Local: 1.19.0; npm latest queried: 1.20.0, modified 2026-06-03. [VERIFIED: npm registry] | Workers-compatible ClickHouse client used by `getInitializedClickHouseClient()` and repository inserts. [VERIFIED: codebase grep] | Official ClickHouse JS docs document `client.insert({ table, values, format: "JSONEachRow" })`, matching the existing repo pattern. [CITED: https://clickhouse.com/docs/integrations/javascript] |
| ClickHouse `MergeTree` | Server unavailable locally during research. [VERIFIED: curl localhost:8123/ping] | Append-only raw event storage for `node_events` and `edge_events`. [VERIFIED: codebase grep] | ClickHouse docs define `ORDER BY` as the sorting key for MergeTree tables, and the current schema already uses MergeTree. [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree] [VERIFIED: codebase grep] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `tslog` | Local: 4.10.2; npm latest queried: 4.10.2, modified 2025-09-30. [VERIFIED: npm registry] | Structured logger used by Hono services and repositories. [VERIFIED: codebase grep] | Keep existing safe count/ID logging; do not log raw edge data payloads. [VERIFIED: hono-server/src/code-base.md] |
| `wrangler` | Local: 4.97.0; package range `^4.4.0`; npm latest queried: 4.97.0, modified 2026-06-02. [VERIFIED: npm registry] | Cloudflare Workers dev/deploy CLI configured in `hono-server/package.json`. [VERIFIED: codebase grep] | Use only for Worker dev smoke if needed; Phase 1 can validate mostly with unit tests and type checks. [VERIFIED: codebase grep] |
| `fallow` | Local CLI: 2.88.1; package range `^2.88.1`; npm latest queried: 2.88.2, modified 2026-06-03. [VERIFIED: npm registry] | Hono code audit required by the code-base guide. [VERIFIED: hono-server/src/code-base.md] | Run `bun run fallow` after implementation. [VERIFIED: local command] |
| `bun test` | Bun 1.3.5 available locally; `bun test` currently reports no tests. [VERIFIED: local command] | Built-in TypeScript-capable test runner without adding packages. [CITED: https://bun.com/docs/test] | Use for Wave 0 focused tests because no Jest/Vitest config exists in `hono-server`. [VERIFIED: codebase grep] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Add Zod or `@hono/zod-validator` | Hono docs support third-party validators. [CITED: https://hono.dev/docs/guides/validation] | Do not add a validation package for this phase; no HTTP route is in scope, and a simple service boundary check satisfies D-04 with less dependency surface. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |
| Validate endpoint node existence at ingest time | Query node events before edge insert. [ASSUMED] | Context explicitly rejects this for Phase 1 because node events may arrive later or in another batch. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |
| Store endpoints only in edge `data` | Put `fromNodeId` and `toNodeId` inside `Map(String, String)`. [ASSUMED] | Context requires explicit canonical endpoint columns for graph projection. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |

**Installation:** No new package install is recommended for this phase. [VERIFIED: hono-server/package.json]

```bash
# no install
```

**Version verification commands run:** [VERIFIED: local command]

```bash
npm view hono version time.modified homepage repository.url
npm view @clickhouse/client-web version time.modified homepage repository.url
npm view tslog version time.modified homepage repository.url
npm view wrangler version time.modified homepage repository.url
npm view fallow version time.modified homepage repository.url
```

## Package Legitimacy Audit

No new external package is recommended or required for Phase 1, so the package legitimacy gate is not applicable. [VERIFIED: hono-server/package.json] Existing package postinstall checks returned no postinstall scripts for `hono`, `@clickhouse/client-web`, `tslog`, `wrangler`, or `fallow`. [VERIFIED: npm registry]

**Packages removed due to slopcheck [SLOP] verdict:** none, because no packages are proposed. [VERIFIED: research scope]
**Packages flagged as suspicious [SUS]:** none, because no packages are proposed. [VERIFIED: research scope]

## Architecture Patterns

### System Architecture Diagram

```text
Ingest request object already inside Hono service boundary
  |
  v
LogServiceImpl.ingestNodesNEdges(data)
  |
  +--> validate edgeStarts:
  |      fromNodeId/toNodeId are non-empty strings
  |      self-edge is allowed
  |      endpoint node existence is not checked
  |
  v
ILogWriteRepo.ingestNodesNEdges(data)
  |
  v
LogWriteRepoClickHouse.buildEdgeRows(data)
  |
  +--> edge start row:
  |      event_type = 0
  |      started_at_ms = edge.startedAt
  |      ended_at_ms = null
  |      from_node_id = edge.fromNodeId
  |      to_node_id = edge.toNodeId
  |      data = edge.data
  |
  +--> edge end row:
         event_type = 1
         started_at_ms = null
         ended_at_ms = edge.endedAt
         endpoint columns null unless planner chooses carry-forward fields
  |
  v
ClickHouse JSONEachRow insert into edge_events
  |
  v
Return to LogServiceImpl
  |
  v
Publish log.trace.ingested per trace after persistence succeeds
```

Diagram flow is derived from current `LogServiceImpl` and `LogWriteRepoClickHouse` control flow. [VERIFIED: codebase grep]

### Recommended Project Structure

```text
hono-server/src/
├── services/log/api/types.ts                         # public ingest contract fields [VERIFIED: codebase grep]
├── services/log/internal/service-impl/LogServiceImpl.ts # endpoint validation and publish ordering [VERIFIED: codebase grep]
├── services/log/internal/repo/types.ts               # repo-local ClickHouse row shapes [VERIFIED: codebase grep]
├── services/log/internal/repo/impl/LogWriteRepoClickHouse.ts # JSONEachRow row mapping and insert [VERIFIED: codebase grep]
└── infra/db/clickhouse/schema.ts                     # raw ClickHouse DDL [VERIFIED: codebase grep]
```

### Component Responsibilities

| Component | Current Shape | Phase 1 Responsibility |
|-----------|---------------|------------------------|
| `IngestEdgeStart` | Has `id`, `traceId`, `edgeType`, and `startedAt`; lacks endpoint fields and `data`. [VERIFIED: codebase grep] | Add `fromNodeId: string`, `toNodeId: string`, and `data: Record<string, string>`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |
| `LogServiceImpl` | Awaits repo write before trace event publish. [VERIFIED: codebase grep] | Add pre-write validation for missing/empty edge start endpoints; keep publish after persistence. [VERIFIED: .planning/ROADMAP.md] |
| `EdgeEventRow` | Has `timestamp_ms` and no endpoint/data fields. [VERIFIED: codebase grep] | Add `from_node_id`, `to_node_id`, `data`, `started_at_ms`, and `ended_at_ms`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |
| `LogWriteRepoClickHouse` | Maps edge start/end inputs to JSONEachRow rows. [VERIFIED: codebase grep] | Map start endpoints/data and split lifecycle timestamp fields. [VERIFIED: codebase grep] |
| `schema.ts` | Defines `node_events` and `edge_events` with `timestamp_ms`. [VERIFIED: codebase grep] | Replace generic lifecycle timestamp column with explicit nullable start/end columns and add edge endpoint/data columns. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |

### Pattern 1: Service Boundary Validation Before Persistence

**What:** Validate `edgeStarts` inside `LogServiceImpl.ingestNodesNEdges` before calling `writeRepo.ingestNodesNEdges`. [VERIFIED: hono-server/src/code-base.md]

**When to use:** Use when rejecting a malformed ingest payload due to missing/empty `fromNodeId` or `toNodeId`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

**Example:**

```typescript
// Source: hono-server/src/code-base.md and Phase 1 CONTEXT.md
private validateEdgeStarts(edgeStarts: IngestEdgeStart[]): void {
  for (const edge of edgeStarts) {
    if (edge.fromNodeId.trim() === "" || edge.toNodeId.trim() === "") {
      throw new Error("Edge start requires fromNodeId and toNodeId.");
    }
  }
}
```

This validation should not check whether the referenced nodes already exist. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

### Pattern 2: Repo-Local Row Mapping

**What:** Keep ClickHouse column names and nullable row details in `internal/repo/types.ts` and `LogWriteRepoClickHouse`. [VERIFIED: hono-server/src/code-base.md]

**When to use:** Use for snake_case storage columns such as `from_node_id`, `to_node_id`, `started_at_ms`, and `ended_at_ms`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

**Example:**

```typescript
// Source: ClickHouse JS docs and current LogWriteRepoClickHouse insert shape
const edgeStartRow: EdgeEventRow = {
  id: edge.id,
  user_id: data.userId,
  trace_id: edge.traceId,
  event_type: 0,
  started_at_ms: edge.startedAt,
  ended_at_ms: null,
  edge_type: edge.edgeType,
  from_node_id: edge.fromNodeId,
  to_node_id: edge.toNodeId,
  data: edge.data,
};
```

The ClickHouse JS docs show object values inserted with `format: "JSONEachRow"`, which matches this row-object pattern. [CITED: https://clickhouse.com/docs/integrations/javascript]

### Pattern 3: Append Then Publish

**What:** Keep the current `await this.writeRepo.ingestNodesNEdges(data)` before `await this.eventBus.publish(...)`. [VERIFIED: codebase grep]

**When to use:** Use for every valid ingest call so read-model work is only published after raw persistence succeeds. [VERIFIED: .planning/ROADMAP.md]

**Example:**

```typescript
// Source: current LogServiceImpl
this.validateEdgeStarts(data.edgeStarts);
await this.writeRepo.ingestNodesNEdges(data);
await this.eventBus.publish(/* trace events */);
```

### Anti-Patterns to Avoid

- **Adding route-level validation for a route that is out of scope:** v1 excludes new HTTP endpoints/routes. [VERIFIED: .planning/REQUIREMENTS.md]
- **Checking node existence in the write path:** Node events may arrive out of order or in another batch, and context defers unknown endpoint diagnostics. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
- **Putting ClickHouse rows in public API types:** Public types must stay stable and should not leak database-only shapes. [VERIFIED: hono-server/src/code-base.md]
- **Publishing before inserting edge rows:** The roadmap requires read-model work only after persistence succeeds. [VERIFIED: .planning/ROADMAP.md]
- **Logging raw edge `data`:** The Hono guide permits safe IDs/counts and forbids raw sensitive payload logging. [VERIFIED: hono-server/src/code-base.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime JSON route validation | New route middleware stack or new schema library | Simple service helper for `edgeStarts` | No HTTP routes are in scope, and endpoint validation is a business precondition. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: hono-server/src/code-base.md] |
| ClickHouse insert serialization | Manual SQL string concatenation | `@clickhouse/client-web` `client.insert({ table, values, format: "JSONEachRow" })` | Official docs show structured JSONEachRow inserts and current code already uses that API. [CITED: https://clickhouse.com/docs/integrations/javascript] [VERIFIED: codebase grep] |
| Graph endpoint inference | Parent id, ancestry path, start order, or node id parsing | Explicit `fromNodeId` / `toNodeId` columns | Project rules say edges are the only graph links. [VERIFIED: AGENTS.md] |
| Durable event delivery | Custom broker/dedupe layer | Existing `IEventBus` contract and `DevEventBus` for this phase | Durable production event bus is v2/out of scope. [VERIFIED: .planning/REQUIREMENTS.md] |

**Key insight:** Phase 1 is about preserving canonical raw facts; later read projection cannot recover true graph endpoints if the raw edge start row does not store them explicitly. [VERIFIED: .planning/REQUIREMENTS.md]

## Common Pitfalls

### Pitfall 1: Type-Only Validation

**What goes wrong:** `IngestEdgeStart` gains TypeScript fields, but malformed runtime objects still reach ClickHouse. [VERIFIED: codebase grep]
**Why it happens:** TypeScript does not validate external or `unknown` runtime data by itself. [ASSUMED]
**How to avoid:** Add service-level checks for non-empty `fromNodeId` and `toNodeId` before repository calls. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
**Warning signs:** Tests only compile types and never call `LogServiceImpl.ingestNodesNEdges` with malformed edge starts. [ASSUMED]

### Pitfall 2: Accidentally Validating Unknown Endpoints

**What goes wrong:** Edge starts are rejected when endpoint node starts are not already present. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
**Why it happens:** Endpoint fields can look like foreign keys, but trace events are append-only and may arrive out of order. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
**How to avoid:** Validate only field presence/non-empty string in this phase. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
**Warning signs:** Plan includes ClickHouse lookups during edge start validation. [VERIFIED: codebase grep]

### Pitfall 3: Nullable Lifecycle Columns In Sorting Keys

**What goes wrong:** New DDL may fail or behave unexpectedly if nullable timestamp columns are placed directly in `ORDER BY`. [ASSUMED]
**Why it happens:** The context requires nullable `started_at_ms` and `ended_at_ms`, while MergeTree `ORDER BY` defines the table sorting key. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree]
**How to avoid:** Require a live ClickHouse DDL smoke test for the exact schema string; if using timestamp ordering, use a verified non-null expression or add an explicit non-null event-time column only if the planner confirms it does not contradict D-12. [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree]
**Warning signs:** Verification only runs TypeScript and never executes the updated `CREATE TABLE` statements. [VERIFIED: local command]

### Pitfall 4: Breaking Publish-After-Persist

**What goes wrong:** `log.trace.ingested` is emitted even though ClickHouse insert failed. [VERIFIED: .planning/ROADMAP.md]
**Why it happens:** Validation or publish logic is moved around the repository call. [VERIFIED: codebase grep]
**How to avoid:** Preserve the current sequence: validate, await repo insert, compute trace ids, publish. [VERIFIED: codebase grep]
**Warning signs:** Tests do not simulate a failing write repo and assert no publish happened. [ASSUMED]

### Pitfall 5: End Rows Pretend To Know Start-Only Metadata

**What goes wrong:** Edge end rows duplicate endpoint values that are not present in `IngestEdgeEnd`. [VERIFIED: codebase grep]
**Why it happens:** A single row type can encourage filling every column on every lifecycle row. [ASSUMED]
**How to avoid:** Keep end rows lifecycle-only: `ended_at_ms` set, `started_at_ms` null, and start-only metadata null or empty according to the chosen DDL. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
**Warning signs:** `IngestEdgeEnd` gets `fromNodeId` and `toNodeId` in Phase 1. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

## Code Examples

### Public Edge Start Contract

```typescript
// Source: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md
export type IngestEdgeStart = {
  id: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  data: Record<string, string>;
  startedAt: number;
};
```

This keeps endpoint fields canonical instead of hiding them inside `data`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

### Repo Row Shape

```typescript
// Source: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md
export type EdgeEventRow = {
  id: string;
  user_id: string;
  trace_id: string;
  event_type: 0 | 1;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  edge_type: string | null;
  from_node_id: string | null;
  to_node_id: string | null;
  data: Record<string, string>;
};
```

Use nullable endpoint columns if end rows do not carry start-only endpoint metadata. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

### DDL Shape To Verify Against ClickHouse

```sql
-- Source: Phase 1 CONTEXT.md and ClickHouse data type docs
CREATE TABLE IF NOT EXISTS edge_events
(
  id String,
  user_id String,
  trace_id String,
  event_type UInt8,
  started_at_ms Nullable(UInt64),
  ended_at_ms Nullable(UInt64),
  edge_type Nullable(String),
  from_node_id Nullable(String),
  to_node_id Nullable(String),
  data Map(String, String)
)
ENGINE = MergeTree
ORDER BY (user_id, trace_id, id, event_type);
```

The planner should treat this as the low-risk default DDL shape and still require a live ClickHouse create/drop smoke test. [CITED: https://clickhouse.com/docs/sql-reference/data-types/nullable] [CITED: https://clickhouse.com/docs/sql-reference/data-types/map] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree]

### Focused Service Test Shape

```typescript
// Source: Bun test docs and current LogServiceImpl dependency injection
import { describe, expect, test } from "bun:test";

describe("LogServiceImpl edge endpoint validation", () => {
  test("rejects missing endpoint fields before persistence", async () => {
    // Use fake ILogWriteRepo and fake IEventBus.
    // Assert repo was not called and publish was not called.
  });
});
```

Bun docs describe a built-in TypeScript-capable test runner, and local `bun test` is available but currently finds no tests. [CITED: https://bun.com/docs/test] [VERIFIED: local command]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Edge metadata without explicit endpoints in Hono raw edge starts. [VERIFIED: codebase grep] | Explicit `fromNodeId`/`toNodeId` in edge start contract and `from_node_id`/`to_node_id` in raw storage. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | Phase 1 planning on 2026-06-04. [VERIFIED: init.phase-op] | Later read edges and ghost projection can connect real graph endpoints. [VERIFIED: .planning/REQUIREMENTS.md] |
| Single `timestamp_ms` column for start/end lifecycle rows. [VERIFIED: codebase grep] | Separate nullable `started_at_ms` and `ended_at_ms` columns while retaining `event_type`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | Phase 1 context gathered on 2026-06-04. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | Later materialization can combine start/end rows without interpreting one generic timestamp column. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |

**Deprecated/outdated:**

- `timestamp_ms` as the only lifecycle timestamp column is outdated for this phase because D-12 requires `started_at_ms` and `ended_at_ms`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]
- Endpoint-only-in-`data` is out of scope because D-02 and D-03 require canonical explicit endpoint fields/columns. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TypeScript does not validate external or `unknown` runtime data by itself. | Common Pitfalls | If wrong, runtime service validation might be redundant; this is low risk because validation is explicitly required by D-04. |
| A2 | DDL may fail or behave unexpectedly if nullable timestamp columns are placed directly in `ORDER BY`. | Common Pitfalls | Planner might over- or under-constrain schema ordering; mitigate with live ClickHouse DDL smoke test. |
| A3 | Tests should simulate a failing write repo to prove no publish occurs. | Common Pitfalls | Planner might choose a different but equivalent verification pattern. |
| A4 | Querying node events before edge insert is a possible alternative to endpoint-presence-only validation. | Alternatives Considered | If wrong, no impact because context explicitly forbids endpoint existence validation in this phase. |
| A5 | Storing endpoint values only inside edge `data` is a possible alternative shape. | Alternatives Considered | If wrong, no impact because context explicitly requires endpoint columns. |
| A6 | Tests that only compile types can miss malformed runtime edge-start objects. | Common Pitfalls | Planner might under-test runtime validation; mitigate with negative service tests. |
| A7 | A single row type can encourage filling every column on every lifecycle row. | Common Pitfalls | Planner might incorrectly add endpoint fields to end inputs; mitigate by keeping end rows lifecycle-only. |
| A8 | Bun module mocking may be an alternative to constructor injection for insert-value tests. | Open Questions (RESOLVED) | Planner chose constructor injection with the current singleton as the default production path. |
| A9 | Research validity windows are estimates. | Metadata | Planner may need to re-check npm versions if planning happens after the listed validity window. |

## Open Questions (RESOLVED)

1. **Exact `ORDER BY` expression after timestamp split**
   - What we know: Context requires nullable lifecycle timestamp columns, and ClickHouse docs define `ORDER BY` as the MergeTree sorting key. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] [CITED: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree]
   - What's unclear: A live ClickHouse instance was not available to verify whether the final chosen expression over nullable lifecycle columns is accepted. [VERIFIED: local command]
   - RESOLVED: Use `ORDER BY (user_id, trace_id, id, event_type)` for the Phase 1 development DDL so nullable lifecycle columns are not part of the sorting key. Keep a conditional live ClickHouse DDL smoke test in Plan 02 before marking execution complete. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-02-PLAN.md]

2. **Whether to add an optional ClickHouse client dependency to `LogWriteRepoClickHouse` for tests**
   - What we know: Current repository gets the singleton client internally, while the Hono guide says repository implementations should inject infrastructure dependencies through constructors. [VERIFIED: codebase grep] [VERIFIED: hono-server/src/code-base.md]
   - What's unclear: The planner may prefer Bun module mocking instead of constructor injection for insert-value tests. [ASSUMED]
   - RESOLVED: Prefer a small optional constructor-injected ClickHouse client or client provider for repository tests, while preserving `getInitializedClickHouseClient()` as the default production path. This makes JSONEachRow row assertions possible without requiring a live ClickHouse server. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-02-PLAN.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Bun | Package scripts, tests, TypeScript execution | yes [VERIFIED: local command] | 1.3.5 [VERIFIED: local command] | None needed |
| Node.js | npm tooling and optional Node runner | yes [VERIFIED: local command] | v25.6.1 [VERIFIED: local command] | Bun for package-local scripts |
| npm | Registry verification | yes [VERIFIED: local command] | 11.9.0 [VERIFIED: local command] | Bun package manager for local installs |
| Wrangler | Worker dev smoke | yes [VERIFIED: local command] | 4.97.0 [VERIFIED: local command] | Not required for Phase 1 unit validation |
| Fallow | Required Hono audit | yes [VERIFIED: local command] | 2.88.1 [VERIFIED: local command] | None; code-base guide requires it |
| ClickHouse at `localhost:8123` | DDL and insert smoke | no [VERIFIED: local command] | unavailable [VERIFIED: local command] | Unit-test row mapping with fake client; run DDL smoke when service is available |
| Context7 CLI `ctx7` | Preferred doc lookup fallback | no [VERIFIED: local command] | unavailable [VERIFIED: local command] | Official docs via web fetch/search were used |

**Missing dependencies with no fallback:**

- Live ClickHouse is missing for final DDL/insert smoke verification; planner must either start ClickHouse or mark that check manual/blocked for execution. [VERIFIED: local command]

**Missing dependencies with fallback:**

- Context7 CLI is missing; official Hono, ClickHouse, Bun, and Node docs were checked through web sources instead. [VERIFIED: local command]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun built-in test runner, local Bun 1.3.5. [VERIFIED: local command] [CITED: https://bun.com/docs/test] |
| Config file | none detected under `hono-server`; only `tsconfig.json` and `bun.lock` exist. [VERIFIED: codebase grep] |
| Quick run command | `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` after Wave 0 creates tests. [VERIFIED: local command] |
| Full suite command | `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow`. [VERIFIED: local command] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| RSCH-01 | Edge starts with missing or empty `fromNodeId`/`toNodeId` are rejected before repository persistence and before event publish. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | unit | `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts` | no, Wave 0 [VERIFIED: codebase grep] |
| RSCH-01 | Self-edges are accepted when both endpoint strings are non-empty. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | unit | `cd hono-server && bun test ./src/services/log/internal/service-impl/LogServiceImpl.test.ts` | no, Wave 0 [VERIFIED: codebase grep] |
| RSCH-02 | Edge start rows inserted into ClickHouse include `from_node_id`, `to_node_id`, `data`, `started_at_ms`, and null `ended_at_ms`. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | unit with fake client | `cd hono-server && bun test ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` | no, Wave 0 [VERIFIED: codebase grep] |
| RSCH-02 | Edge end rows remain lifecycle-only with `ended_at_ms` set and start-only metadata null/empty. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] | unit with fake client | `cd hono-server && bun test ./src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` | no, Wave 0 [VERIFIED: codebase grep] |
| RSCH-02 | Updated raw DDL creates `edge_events` with explicit endpoint columns. [VERIFIED: .planning/REQUIREMENTS.md] | integration smoke | `clickhouse-client --query "$(node/bun print schema)"` or HTTP equivalent when ClickHouse is running | no, environment gap [VERIFIED: local command] |

### Sampling Rate

- **Per task commit:** `cd hono-server && bun test <changed-test-files> && bun x tsc --noEmit --project tsconfig.json`. [VERIFIED: local command]
- **Per wave merge:** `cd hono-server && bun test && bun x tsc --noEmit --project tsconfig.json && bun run fallow`. [VERIFIED: local command]
- **Phase gate:** Full suite green plus ClickHouse DDL/insert smoke when ClickHouse is available. [VERIFIED: local command]

### Wave 0 Gaps

- [ ] `hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` covers endpoint validation, self-edge acceptance, and publish-after-persist failure behavior. [VERIFIED: codebase grep]
- [ ] `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.test.ts` covers JSONEachRow values for node and edge rows after lifecycle timestamp split. [VERIFIED: codebase grep]
- [ ] Optional fake ClickHouse client injection or Bun module mock support is needed to test repository insert values without a running server. [VERIFIED: codebase grep] [CITED: https://bun.com/docs/test]
- [ ] Add a package script such as `"test": "bun test"` only if the planner wants stable command ergonomics; current package has no test script. [VERIFIED: hono-server/package.json]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no for Phase 1 | Auth is out of scope for v1; service contract still accepts `userId`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: codebase grep] |
| V3 Session Management | no for Phase 1 | No session or route work is in scope. [VERIFIED: .planning/REQUIREMENTS.md] |
| V4 Access Control | limited | Preserve `userId` on raw rows and event payloads; do not add auth decisions in log service. [VERIFIED: codebase grep] [VERIFIED: hono-server/src/code-base.md] |
| V5 Input Validation | yes | Service-level validation rejects missing/empty edge endpoint fields before persistence. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |
| V6 Cryptography | no | No cryptographic operation is part of Phase 1. [VERIFIED: .planning/ROADMAP.md] |

### Known Threat Patterns for Hono Log Ingestion

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Payload log leakage | Information Disclosure | Log only IDs and counts; never log raw `data` maps. [VERIFIED: hono-server/src/code-base.md] |
| Malformed edge start creates unusable graph edge | Tampering | Reject missing/empty `fromNodeId` and `toNodeId` at service boundary. [VERIFIED: .planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md] |
| Cross-user trace mixing | Tampering / Elevation of Privilege | Keep `user_id` on every raw node and edge row and publish payload; auth ownership is deferred but storage remains user-scoped. [VERIFIED: codebase grep] [VERIFIED: .planning/REQUIREMENTS.md] |
| Premature read-model work | Integrity | Publish `log.trace.ingested` only after repository insert resolves successfully. [VERIFIED: codebase grep] [VERIFIED: .planning/ROADMAP.md] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/01-edge-endpoint-raw-contract/01-CONTEXT.md` - locked implementation decisions and deferred scope. [VERIFIED: codebase grep]
- `.planning/REQUIREMENTS.md` - RSCH-01 and RSCH-02 definitions plus v1 out-of-scope boundaries. [VERIFIED: codebase grep]
- `.planning/ROADMAP.md` - Phase 1 goal and success criteria. [VERIFIED: codebase grep]
- `AGENTS.md` - project constraints and Hono-only scope. [VERIFIED: codebase grep]
- `hono-server/src/code-base.md` - service/repository/type/logging/Fallow rules. [VERIFIED: codebase grep]
- `hono-server/src/services/log/api/types.ts` - current public ingest types. [VERIFIED: codebase grep]
- `hono-server/src/services/log/internal/service-impl/LogServiceImpl.ts` - current append then publish order. [VERIFIED: codebase grep]
- `hono-server/src/services/log/internal/repo/types.ts` - current row shapes. [VERIFIED: codebase grep]
- `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` - current JSONEachRow row mapping and inserts. [VERIFIED: codebase grep]
- `hono-server/src/infra/db/clickhouse/schema.ts` - current ClickHouse raw DDL. [VERIFIED: codebase grep]
- https://clickhouse.com/docs/integrations/javascript - official ClickHouse JS insert examples. [CITED: clickhouse.com/docs/integrations/javascript]
- https://clickhouse.com/docs/sql-reference/data-types/map - official ClickHouse `Map(K, V)` docs. [CITED: clickhouse.com/docs/sql-reference/data-types/map]
- https://clickhouse.com/docs/sql-reference/data-types/nullable - official ClickHouse `Nullable(T)` docs. [CITED: clickhouse.com/docs/sql-reference/data-types/nullable]
- https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree - official MergeTree `ORDER BY` docs. [CITED: clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree]
- https://hono.dev/docs/guides/validation - official Hono validation docs. [CITED: hono.dev/docs/guides/validation]
- https://hono.dev/docs/guides/testing - official Hono testing docs. [CITED: hono.dev/docs/guides/testing]
- https://bun.com/docs/test - official Bun test runner docs. [CITED: bun.com/docs/test]

### Secondary (MEDIUM confidence)

- npm registry queries for `hono`, `@clickhouse/client-web`, `tslog`, `wrangler`, and `fallow` versions and postinstall scripts. [VERIFIED: npm registry]
- Local command probes for Bun, Node.js, npm, Wrangler, Fallow, and ClickHouse availability. [VERIFIED: local command]

### Tertiary (LOW confidence)

- Assumptions A1-A9 in the Assumptions Log. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - package versions were checked locally and through npm registry, and no new package is recommended. [VERIFIED: npm registry]
- Architecture: HIGH - file boundaries and control flow were verified in the current Hono code and architecture guide. [VERIFIED: codebase grep]
- Pitfalls: MEDIUM - validation/order/publish risks are code-verified, while nullable sorting-key risk still needs live ClickHouse verification. [VERIFIED: codebase grep] [ASSUMED]

**Research date:** 2026-06-04 [VERIFIED: init.phase-op]
**Valid until:** 2026-07-04 for codebase-local findings; 2026-06-11 for npm/latest tooling versions. [ASSUMED]

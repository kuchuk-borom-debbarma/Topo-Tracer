# Phase 1: Edge Endpoint Raw Contract - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase updates the Hono append-only edge event contract so edge start events
carry explicit graph endpoints and raw ClickHouse edge rows persist those
endpoints. It also clarifies the lifecycle timestamp shape for raw node and edge
events. This phase does not add HTTP routes, read tables, materialization, or
ghost projection logic.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope

- `.planning/PROJECT.md` — Defines Hono-only scope, read-model goals, and
  project-level constraints.
- `.planning/REQUIREMENTS.md` — Defines Phase 1 requirements `RSCH-01` and
  `RSCH-02`, plus v1 out-of-scope boundaries.
- `.planning/ROADMAP.md` — Defines Phase 1 goal and success criteria.
- `.planning/research/SUMMARY.md` — Summarizes research recommendations and
  phase ordering.

### Hono Architecture Rules

- `hono-server/src/code-base.md` — Mandatory implementation guide for service
  boundaries, repository usage, ClickHouse access, plain types, event bus
  semantics, logging, and verification.

### Current Hono Edge Ingestion Code

- `hono-server/src/services/log/api/types.ts` — Current `IngestEdgeStart` and
  `IngestEdgeEnd` public input types.
- `hono-server/src/services/log/api/ILogService.ts` — Public log service ingest
  contract.
- `hono-server/src/services/log/internal/repo/ILogWriteRepo.ts` — Write
  repository ingest contract.
- `hono-server/src/services/log/internal/repo/types.ts` — Repo-private
  ClickHouse row types.
- `hono-server/src/services/log/internal/repo/impl/LogWriteRepoClickHouse.ts` —
  Current mapping from public ingest inputs to `edge_events` rows.
- `hono-server/src/infra/db/clickhouse/schema.ts` — Current raw ClickHouse node
  and edge event DDL.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `LogWriteRepoClickHouse.buildEdgeRows` already centralizes edge row mapping;
  Phase 1 should extend this mapping rather than add ClickHouse access in the
  service or worker.
- `EdgeEventRow` already lives in repo-local `types.ts`; endpoint and data row
  fields should be added there.
- `CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE` already defines raw edge DDL; Phase 1
  should update this schema string with explicit comments beside each new
  column.

### Established Patterns

- Public service input types live in `services/log/api/types.ts`.
- Repo-private row shapes live in `services/log/internal/repo/types.ts`.
- Services and repositories use object-shaped inputs, explicit contracts, and
  safe summary logging.
- ClickHouse access stays in repository implementations.

### Integration Points

- `IngestEdgeStart` needs `fromNodeId`, `toNodeId`, and `data`.
- `edge_events` needs `from_node_id`, `to_node_id`, `data`, `started_at_ms`,
  and `ended_at_ms`.
- `node_events` should also move from generic `timestamp_ms` to explicit
  `started_at_ms` / `ended_at_ms` lifecycle columns.
- `LogWriteRepoClickHouse` must map start rows and end rows according to
  `event_type`.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants edge events to have a `data Map(String, String)`
  like node events.
- The user explicitly prefers explicit endpoint columns for `fromNodeId` and
  `toNodeId`.
- The user explicitly wants `event_type` to remain.
- The user clarified that only start events require `startedAt`; only end events
  require `endedAt`.

</specifics>

<deferred>
## Deferred Ideas

- Validating whether endpoint node ids exist is deferred to read
  materialization diagnostics because source events may arrive out of order.
- Read tables, checkpoints, materialization, and ghost projection are deferred
  to later phases.
- HTTP routes/endpoints remain out of scope for v1.

</deferred>

---

*Phase: 1-Edge Endpoint Raw Contract*
*Context gathered: 2026-06-04*

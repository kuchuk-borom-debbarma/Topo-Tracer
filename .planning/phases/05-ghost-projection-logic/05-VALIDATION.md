---
phase: 05
phase_slug: ghost-projection-logic
status: planned
created: 2026-06-05
source: 05-RESEARCH.md
---

# Phase 5 Validation Strategy

## Validation Architecture

Phase 5 should be validated with fixture-heavy tests before relying on any
future route or UI behavior. The central risk is that a projection can appear
to work for simple visible nodes while silently violating hidden-range,
snapping, aggregation, or safety-cap requirements.

## Required Checks

1. Projection type/contract assertions prove public DTOs exist and database row
   shapes do not leak.
2. Repository fake-client tests prove bounded projection-node input is scoped,
   latest-state grouped, deterministically ordered, and capped.
3. Pure projector tests prove threshold visibility, ghost range creation,
   summary accumulation, snapping, duplicate edge aggregation, all-hidden
   behavior, and orphan omission.
4. Service orchestration tests prove production projection uses bounded reads,
   not `loadLatestReadModel`.
5. Safe logging/source assertions prove raw node and edge payloads are not
   logged.

## Blocking Verification Commands

- `cd hono-server && bun test`
- `cd hono-server && bun run fallow`

## Phase 6 Carry-Forward

Phase 6 should expand these fixtures into broader verification and observability
coverage, especially late-event ordering, duplicate delivery, and safe runtime
summaries.

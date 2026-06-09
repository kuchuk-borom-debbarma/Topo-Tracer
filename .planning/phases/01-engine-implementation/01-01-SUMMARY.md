---
phase: 01-engine-implementation
plan: 01
status: completed
wave: 1
---

# Summary: Schema and Type Updates

Updated the data structures and persistence layer to support clock-skew tracking (per D-10).

## Accomplishments
- Updated `ReadNode` and `ReadEdge` API types with tracking fields.
- Updated `ReadNodeRow` and `ReadEdgeRow` repository types.
- Updated ClickHouse schema in `schema.ts`.
- Implemented mapping logic in `LogReadRepoClickHouse.ts`.
- Fixed type errors in `FakeReadRepo` and related test helpers.

## Verification Results
- `bun x tsc --noEmit` verified core logic alignment.
- Schema definitions verified for correctness.

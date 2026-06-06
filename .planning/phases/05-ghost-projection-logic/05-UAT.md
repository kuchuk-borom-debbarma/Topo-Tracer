---
status: testing
phase: 05-ghost-projection-logic
source:
  - .planning/phases/05-ghost-projection-logic/05-01-SUMMARY.md
  - .planning/phases/05-ghost-projection-logic/05-02-SUMMARY.md
  - .planning/phases/05-ghost-projection-logic/05-03-SUMMARY.md
started: 2026-06-05T16:30:00Z
updated: 2026-06-05T16:30:00Z
---

## Current Test

number: 1
name: Projection DTOs and Repository Contract
expected: |
  Projection DTOs (normal node, ghost node, edge, metadata) exist in `api/types.ts`. 
  `ILogReadRepo` exposes `loadBoundedProjectionNodes` for capped node reads without threshold filtering.
awaiting: user response

## Tests

### 1. Projection DTOs and Repository Contract
expected: Projection DTOs exist with correct fields (ghost shape, metadata). `ILogReadRepo` implements `loadBoundedProjectionNodes`.
result: [passed]

### 2. LogGraphProjector Visibility and Ghosting
expected: `LogGraphProjector` correctly separates visible nodes from hidden ones based on `importanceLevel <= threshold`. Contiguous hidden runs are grouped into deterministic ghost nodes with summaries.
result: [passed]

### 3. Edge Snapping and Aggregation
expected: `LogGraphProjector` snaps hidden-touching edges to ghost nodes and aggregates multiple snapped edges between the same endpoints into a single projected edge with `edgeCount`.
result: [passed]

### 4. Service Orchestration and Safety
expected: `LogServiceImpl.projectTraceGraph` orchestrates bounded reads into the projector. It does not call `loadLatestReadModel` and logs only safe metadata.
result: [passed]

### 5. Malformed Data Handling
expected: Orphan or malformed edges are omitted and counted in metadata. Malformed graph data degrades deterministically through snapping and aggregation.
result: [passed]

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]

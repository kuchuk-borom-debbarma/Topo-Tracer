---
phase: 05-ghost-projection-logic
plan: 02
subsystem: log-service
tags: [projection, ghosting, snapping, aggregation]
dependency_graph:
  requires: [05-01]
  provides: [05-02]
  affects: [log-service]
tech_stack:
  added: []
  patterns: [pure-projection, ghosting-ranges, edge-snapping]
key_files:
  created:
    - hono-server/src/services/log/internal/projection/LogGraphProjector.ts
    - hono-server/src/services/log/internal/projection/LogGraphProjector.test.ts
    - hono-server/src/services/log/internal/projection/types.ts
decisions:
  - D-01: Pure in-memory projection.
  - D-07: Range-based ghost IDs.
  - D-08: Contiguous hidden runs.
  - D-12: Edge snapping through ghosts.
  - D-14: Edge aggregation by source/target/type.
metrics:
  duration: 25m
  completed_date: 2026-06-05
---

# Phase 05 Plan 02: Implement the pure in-memory ghost projection algorithm Summary

Implemented the `LogGraphProjector` component which transforms bounded latest nodes and edges into a projected graph based on an importance threshold. The implementation handles visibility logic, deterministic ghost node creation for hidden ranges, edge snapping through ghosts, and edge aggregation.

## Key Changes

### LogGraphProjector Implementation
- **Visibility Logic**: Nodes with `importanceLevel <= threshold` are returned as normal nodes; others are hidden.
- **Ghosting**: Contiguous hidden runs (sorted by `flowOrder`) are collapsed into single ghost nodes with deterministic IDs: `ghost:{traceId}:{threshold}:{startFlowOrder}:{endFlowOrder}`.
- **Ghost Summaries**: Each ghost node includes counts of hidden nodes and edges, aggregated node types, importance ranges, and time ranges.
- **Edge Snapping**: Edges touching hidden nodes are "snapped" to the corresponding ghost node.
- **Edge Aggregation**: Projected edges are aggregated by source ID, target ID, and edge type, with an `edgeCount` field.
- **Metadata**: Returns projection metadata including threshold, counts, materialized timestamp, cap hits, and omitted malformed edge counts.

### Pure Projection Fixtures
- Created comprehensive test suite in `LogGraphProjector.test.ts` covering:
    - Threshold visibility.
    - Hidden prefix, suffix, and middle ranges.
    - All-hidden traces.
    - Visible-hidden-visible snapping.
    - Same-ghost hidden edge summarization (omitting self-loops).
    - Cross-ghost snapping.
    - Aggregation of duplicate snapped edges.
    - Omission of orphan/malformed edges.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None - implementation follows the threat model and mitigates identified threats through aggregation, omission of malformed data, and returning summaries rather than raw hidden data.

## Self-Check: PASSED
- [x] All 11 projection fixtures passed.
- [x] All existing hono-server tests passed (72 total).
- [x] Commits made for test (RED) and implementation (GREEN).
- [x] No leaks of ClickHouse or repository concerns into the projector.

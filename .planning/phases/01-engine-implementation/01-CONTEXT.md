# Phase 1: Engine Implementation - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements the causal clock-skew auto-correction engine within the `TraceReadModelMaterializer`. It focuses on detecting and self-healing timestamp violations where child nodes appear to start before their parents. The correction will ensure all nodes in a trace are chronologically consistent with their causal topological order.

</domain>

<decisions>
## Implementation Decisions

### Correction Logic
- **D-01: Strategy:** Minimal correction using `child.startedAt = parent.startedAt + 1ms`.
- **D-02: Zero Tolerance:** Correct any detected skew, regardless of magnitude.
- **D-03: Duration Preservation:** When shifting `startedAt`, also shift `endedAt` by the same delta to preserve the node's original duration.
- **D-10: Explicit Tracking:** The `ReadNode` and `ReadEdge` structures will be extended to track corrections:
  - `startedAt`: The corrected (active) timestamp.
  - `originalStartedAt`: The raw timestamp from telemetry.
  - `clockSkewMs`: The total delta applied (Correction - Raw).

### Edge Case Handling
- **D-04: Multiple Parents:** In the rare case a node has multiple causal parents, it will be corrected against the **earliest parent** (the one with the smallest `startedAt`).
- **D-05: Cycle Correction:** Apply correction even to nodes within a detected cycle to preserve the visual "flow" in the graph layout.
- **D-06: Lazy Propagation:** Shifts will propagate "lazily." A child node is only shifted if its own `startedAt` is less than its parent's corrected `startedAt`. Already-causal downstream nodes are not moved unnecessarily.

### Integration
- **D-07: Placement:** Logic will be implemented as a dedicated private method `correctClockSkew` in `TraceReadModelMaterializer`.
- **D-08: Execution Order:** It will be called after `applyFlowOrder` (where topological positions are injected) and before `buildSummary`.
- **D-09: Persistence:** Corrected timestamps are written to the materialized read model (`read_nodes`, `read_edges`) only. Raw telemetry tables remain unchanged for auditing.

### Claude's Discretion
- Claude has discretion over the internal implementation of the node-to-parents lookup map within the materializer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Logic
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` — Target for implementation.
- `hono-server/src/services/log/internal/materialization/flowOrder.ts` — Source of topological sorting logic.

### Design
- `docs/TRACE_FLOW_CODE_LEVEL.md` — Detailed flow of trace events and materialization.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MaterializationDiagnostics` interface: `diagClockSkew` counter already exists and should be incremented for each corrected node.
- `FakeReadRepo` in `test-helpers`: Use this for verifying timestamp adjustments in unit tests.

### Established Patterns
- Topological processing: `computeFlowOrder` provides the deterministic sequence needed for a single-pass correction.
- Incremental building: The materializer already folds new events into existing state; correction must work on the final folded array.

</code_context>

<specifics>
## Specific Ideas
- No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas
- None — discussion stayed within phase scope.
</deferred>

---

*Phase: 1-Engine Implementation*
*Context gathered: 2026-06-08*

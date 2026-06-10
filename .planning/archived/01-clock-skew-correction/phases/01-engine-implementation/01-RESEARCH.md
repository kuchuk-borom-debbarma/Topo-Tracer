# Phase 1: Engine Implementation for Causal Clock-Skew Auto-Correction - Research

**Researched:** 2026-06-08
**Domain:** Distributed Trace Materialization / Causal Consistency
**Confidence:** HIGH

## Summary

This research phase defines the implementation strategy for the causal clock-skew auto-correction engine in Topo-Tracer. The core problem is that distributed services often report timestamps that violate causality (e.g., a child node starting before its parent). We will implement a topological-pass correction algorithm within `TraceReadModelMaterializer.ts` that detects these violations and "self-heals" the trace timestamps by shifting child nodes to be at least 1ms after their parents, while preserving their original durations.

**Primary recommendation:** Implement `correctClockSkew` as a private method in `TraceReadModelMaterializer`, invoked immediately after `applyFlowOrder`. Use the `flowOrder` to ensure a single-pass correction where parent shifts propagate correctly to children.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Strategy:** Minimal correction using `child.startedAt = parent.startedAt + 1ms`.
- **D-02: Zero Tolerance:** Correct any detected skew, regardless of magnitude.
- **D-03: Duration Preservation:** When shifting `startedAt`, also shift `endedAt` by the same delta to preserve the node's original duration.
- **D-10: Explicit Tracking:** The `ReadNode` and `ReadEdge` structures will be extended to track corrections:
  - `startedAt`: The corrected (active) timestamp.
  - `originalStartedAt`: The raw timestamp from telemetry.
  - `clockSkewMs`: The total delta applied (Correction - Raw).
- **D-04: Multiple Parents:** In the rare case a node has multiple causal parents, it will be corrected against the **earliest parent** (the one with the smallest `startedAt`).
- **D-05: Cycle Correction:** Apply correction even to nodes within a detected cycle to preserve the visual "flow" in the graph layout.
- **D-06: Lazy Propagation:** Shifts will propagate "lazily." A child node is only shifted if its own `startedAt` is less than its parent's corrected `startedAt`. Already-causal downstream nodes are not moved unnecessarily.
- **D-07: Placement:** Logic will be implemented as a dedicated private method `correctClockSkew` in `TraceReadModelMaterializer`.
- **D-08: Execution Order:** It will be called after `applyFlowOrder` (where topological positions are injected) and before `buildSummary`.
- **D-09: Persistence:** Corrected timestamps are written to the materialized read model (`read_nodes`, `read_edges`) only. Raw telemetry tables remain unchanged for auditing.

### the agent's Discretion
- Claude has discretion over the internal implementation of the node-to-parents lookup map within the materializer.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Causal Clock-Skew Detection | API / Backend | — | Logic resides in the materializer which transforms raw events into read models. |
| Auto-Correction Engine | API / Backend | — | Core logic for timestamp adjustment during materialization. |
| Persistence of Corrected Data | Database / Storage | — | Corrected values are stored in `read_nodes` and `read_edges` in ClickHouse. |
| Diagnostic Reporting | API / Backend | — | Aggregation of skew metrics into the trace summary. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.8.3 [VERIFIED: package.json] | Language | Project standard for type safety. |
| @clickhouse/client-web | ^1.19.0 [VERIFIED: package.json] | Database Driver | High-performance OLAP for trace storage. |
| tslog | ^4.10.2 [VERIFIED: package.json] | Logging | Standardized structured logging. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| Bun | 1.3.5 [VERIFIED: runtime] | Runtime/Test runner | Used for executing the backend and running tests. |

## Package Legitimacy Audit

No new external packages are required for this phase. All logic is implemented using existing dependencies.

## Architecture Patterns

### Recommended Project Structure
Updates will be made to existing files:
- `hono-server/src/services/log/api/types.ts`: Update `ReadNode` and `ReadEdge` interfaces.
- `hono-server/src/infra/db/clickhouse/schema.ts`: Update ClickHouse table definitions.
- `hono-server/src/services/log/internal/repo/types.ts`: Update DTO types for repository mapping.
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts`: Implement correction engine.
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts`: Update persistence logic.

### Pattern: Topological Correction Pass
**What:** Process graph nodes in their topological order to ensure causal parent-to-child propagation in a single pass.
**When to use:** Whenever a property of a node depends on the resolved properties of its causal ancestors.
**Example:**
```typescript
// Iterating in flowOrder ensures parents are corrected before children
const sortedNodes = [...nodesArray].sort((a, b) => a.flowOrder - b.flowOrder);
for (const node of sortedNodes) {
  const parent = getParent(node);
  if (parent && node.startedAt < parent.startedAt) {
    applyCorrection(node, parent.startedAt + 1);
  }
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Topological Sorting | Custom DFS | `computeFlowOrder` | The project already has a robust, cycle-aware topological sorter in `flowOrder.ts`. |
| Date Math | Custom microsecond logic | Standard Millisecond timestamps | Telemetry and ClickHouse schema use UTC milliseconds; keep logic consistent with these. |

## Common Pitfalls

### Pitfall 1: Multi-parent resolution
**What goes wrong:** Correcting against the latest parent instead of the earliest parent can cause unnecessary shifts or larger deltas than required.
**How to avoid:** Explicitly follow D-04: use `Math.min(...parentStartedAts)` to find the earliest boundary.

### Pitfall 2: Disregarding Edges
**What goes wrong:** Correcting only nodes but leaving edges with their raw (potentially skewed) timestamps leads to visual "flicker" or broken lines in the UI graph.
**How to avoid:** Ensure `ReadEdge` also undergoes correction relative to its `fromNodeId`.

## Code Examples

### Corrected Types (api/types.ts)
```typescript
export type ReadNode = {
  // ... existing fields
  startedAt: number; // Corrected
  originalStartedAt: number; // Raw
  clockSkewMs: number; // Delta
};

export type ReadEdge = {
  // ... existing fields
  startedAt: number; // Corrected
  originalStartedAt: number; // Raw
  clockSkewMs: number; // Delta
};
```

### Proposed Correction Engine (TraceReadModelMaterializer.ts)
```typescript
private correctClockSkew(params: {
  nodesArray: ReadNode[];
  savedEdges: ReadEdge[];
  diags: MaterializationDiagnostics;
}): void {
  const { nodesArray, savedEdges, diags } = params;
  const nodeMap = new Map<string, ReadNode>(nodesArray.map(n => [n.id, n]));
  
  // 1. Pre-map children to their parents for O(1) lookup during pass
  const nodeToParents = new Map<string, ReadNode[]>();
  for (const edge of savedEdges) {
    const parent = nodeMap.get(edge.fromNodeId);
    const child = nodeMap.get(edge.toNodeId);
    if (parent && child) {
      const parents = nodeToParents.get(child.id) || [];
      parents.push(parent);
      nodeToParents.set(child.id, parents);
    }
  }

  // 2. Process Nodes in Topological Order (D-08)
  const sortedNodes = [...nodesArray].sort((a, b) => a.flowOrder - b.flowOrder);
  for (const node of sortedNodes) {
    node.originalStartedAt = node.startedAt;
    node.clockSkewMs = 0;

    const parents = nodeToParents.get(node.id) || [];
    if (parents.length === 0) continue;

    // D-04: Earliest parent bias
    const minParentStart = Math.min(...parents.map(p => p.startedAt));

    if (node.startedAt < minParentStart) {
      const correction = minParentStart + 1; // D-01
      const delta = correction - node.startedAt;
      
      node.startedAt = correction;
      if (node.endedAt !== null) {
        node.endedAt += delta; // D-03
      }
      node.clockSkewMs = delta;
      diags.diagClockSkew++; // FR5
    }
  }

  // 3. Align Edges with their corrected parent nodes
  for (const edge of savedEdges) {
    edge.originalStartedAt = edge.startedAt;
    edge.clockSkewMs = 0;
    
    const fromNode = nodeMap.get(edge.fromNodeId);
    if (fromNode && edge.startedAt < fromNode.startedAt) {
      const correction = fromNode.startedAt + 1;
      const delta = correction - edge.startedAt;
      edge.startedAt = correction;
      if (edge.endedAt !== null) edge.endedAt += delta;
      edge.clockSkewMs = delta;
    }
  }
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Test execution | ✓ | 1.3.5 | — |
| Node.js | Runtime | ✓ | v25.6.1 | — |
| ClickHouse | Persistence | ✗ (Local) | — | Mock in tests |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun Test |
| Quick run command | `bun test hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.clockSkew.test.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR1-FR2| Corrects child if child.start < parent.start | unit | `bun test ... -x` | ❌ Wave 0 |
| FR3    | Correction cascades to grandchildren | unit | `bun test ... -x` | ❌ Wave 0 |
| FR4    | Preservation of duration (delta applied to end) | unit | `bun test ... -x` | ❌ Wave 0 |
| D-04   | Corrects against EARLIEST parent | unit | `bun test ... -x` | ❌ Wave 0 |
| D-05   | Corrects nodes even in cycles | unit | `bun test ... -x` | ❌ Wave 0 |
| D-10   | Tracking fields populated correctly | unit | `bun test ... -x` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.clockSkew.test.ts` — Comprehensive test suite for all clock-skew scenarios.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Ensure timestamps coming from telemetry are within sane bounds before correction. |

## Sources

### Primary (HIGH confidence)
- `TraceReadModelMaterializer.ts` - Source code for injection point.
- `api/types.ts` - Type definitions.
- `CONTEXT.md` - Locked implementation decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing project dependencies.
- Architecture: HIGH - Topological pass is the standard approach for causal consistency.
- Pitfalls: HIGH - Documented based on distributed systems experience and project constraints.

**Research date:** 2026-06-08
**Valid until:** 2026-07-08

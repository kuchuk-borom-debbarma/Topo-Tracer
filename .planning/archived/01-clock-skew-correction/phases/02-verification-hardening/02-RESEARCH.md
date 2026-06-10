# Phase 2: Verification & Hardening - Research

**Researched:** 2026-06-09
**Domain:** Performance Benchmarking, Stress Testing, Persistence Verification
**Confidence:** HIGH

## Summary

This research establishes the performance and stability baseline for the Topo-Tracer correction engine. Investigations into the current materialization logic reveal a significant time-complexity bottleneck in the topological sort implementation (`computeFlowOrder`) which currently scales at $O(E \times N)$ or $O(N^2)$ for wide graphs due to manual sorted insertion and array shifts. This will fail the D-12/D-13 requirements (50k nodes, <5ms per 1k nodes) for large fan-out traces.

We have mapped the persistence verification strategy to use the existing `FakeClickHouseClient`, which already records SQL insertions, allowing us to verify D-15 (Corrected timestamps mapped to SQL) without a live database. Synthetic data generation patterns have been designed to target the specific edge cases (deep nesting and massive fan-out) required by D-14 and D-16.

**Primary recommendation:** Replace the manual sorted insertion in `computeFlowOrder` with a binary search-based insertion or a proper Min-Heap to achieve $O((N+E) \log N)$ complexity, ensuring stability for 50k-node traces.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trace Materialization | API / Backend | — | Heavy data processing and causal correction must happen where the source of truth (ClickHouse) is accessible. |
| Clock Skew Correction | API / Backend | — | Core engine logic; requires full trace context to propagate shifts. |
| Persistence Mapping | API / Backend | Database | Repo layer translates domain models to ClickHouse-specific SQL `INSERT` structures. |
| Stress Testing | Build / CI | — | Performance benchmarks run in the CI environment using synthetic generators. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tinyqueue` | 3.0.0 | Priority Queue | High-performance Min-Heap for $O(\log N)$ topological sort candidates. [VERIFIED: npm registry] |
| `bun:test` | 1.1.x | Testing Framework | Project standard; extremely fast for large-scale unit/integration tests. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `FakeClickHouseClient` | internal | Mock Persistence | Verifying SQL mapping (D-15) without Docker overhead. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tinyqueue` | `priorityqueue` | `tinyqueue` is smaller and faster for simple numeric priorities (startedAt). |
| `piscina` | — | Offloading correction to workers; deferred until single-thread performance is maximized. |

**Installation:**
```bash
# Verify versions
npm view tinyqueue version # 3.0.0
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `tinyqueue` | npm | 5 yrs | 1.2M/wk | github.com/mourner/tinyqueue | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### Performance-First Topological Sort
To meet D-13 (<5ms/1k nodes), Kahn's algorithm must be implemented with a Priority Queue.

```typescript
// Proposed improvement for flowOrder.ts
import TinyQueue from 'tinyqueue';

function computeFlowOrder(nodes, edges) {
  // ... build inDegree and adj ...
  
  const candidates = new TinyQueue([], (a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
    return a.id < b.id ? -1 : 1;
  });

  // Initial roots
  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) candidates.push(node);
  }

  while (candidates.length > 0) {
    const node = candidates.pop(); // O(log N)
    // ... process neighbors ...
    if (newDegree === 0) candidates.push(neighbor); // O(log N)
  }
}
```

### Synthetic Trace Generator Pattern
A utility class to generate complex topologies deterministically.

```typescript
class TraceGenerator {
  constructor(private userId: string, private traceId: string) {}

  generateChain(length: number, startTs: number): { nodes: RawNode[], edges: RawEdge[] } {
    // Generates A -> B -> C ... (D-14)
  }

  generateFanOut(count: number, startTs: number): { nodes: RawNode[], edges: RawEdge[] } {
    // Generates Parent -> [Child1, Child2, ...] (D-16)
  }
  
  injectSkew(nodes: RawNode[], nodeIndex: number, driftMs: number) {
    // Manually break a node's timestamp to test correction (D-16)
  }
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Priority Queue | Manual sorted array | `tinyqueue` | `splice` and `shift` are $O(N)$, leading to $O(N^2)$ overall; Heaps are $O(\log N)$. |
| Large Object Memory Monitoring | Manual `console.log` | `process.memoryUsage()` | Provides resident set size (RSS) and heap used/total for D-12 verification. |

## Common Pitfalls

### Pitfall 1: $O(N^2)$ Candidate Management
**What goes wrong:** Using `array.shift()` and `array.splice()` to maintain a sorted list of topological roots.
**Why it happens:** It works for small traces (e.g., 10 nodes) but explodes for wide graphs (e.g., 10k children).
**How to avoid:** Use a Binary Heap (Priority Queue).

### Pitfall 2: Memory Fragmentation with 50k Objects
**What goes wrong:** Creating intermediate Maps/Sets inside loops during materialization.
**Why it happens:** High pressure on the V8 garbage collector (GC).
**How to avoid:** Reuse maps where possible or ensure they are scoped to be collected quickly. Monitor `heapUsed` during 50k tests.

### Pitfall 3: Stack Overflow on Deep Nesting
**What goes wrong:** Recursive topological sort or recursive parent-walking.
**Why it happens:** Default JS stack limit is ~10k calls; D-14 requires 5k levels but other processing might add frames.
**How to avoid:** Keep all graph traversals iterative (using queues/stacks).

## Code Examples

### Verifying Persistence (D-15)
Using the recorded inserts in `FakeClickHouseClient`.

```typescript
// Source: hono-server/src/services/log/internal/repo/impl/test-helpers.ts
it("verifies persistence mapping", async () => {
  const fakeClient = new FakeClickHouseClient();
  const repo = createRepoWithFakeClient(fakeClient);
  
  await repo.saveReadModel({
    nodes: [correctedNode],
    // ...
  });

  const nodeInsert = fakeClient.inserts.find(i => i.table === "read_nodes");
  const row = nodeInsert.values[0];
  
  expect(row.started_at_ms).toBe(101); // Corrected
  expect(row.original_started_at_ms).toBe(50); // Original
  expect(row.clock_skew_ms).toBe(51); // Delta
});
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 50k nodes with edges fit in ~512MB RAM | Summary | If memory usage is higher, D-12 requires streaming materialization (huge refactor). |
| A2 | `tinyqueue` is stable and faster than binary search + splice | Standard Stack | If `tinyqueue` overhead is high, simple binary search might be better. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 25.6.1 | — |
| Bun | Test Runner | ✓ | 1.3.5 | — |
| Docker | ClickHouse (Future) | ✓ | 29.2.1 | — |
| slopcheck | Security | ✓ | 0.6.1 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | `hono-server/package.json` |
| Quick run command | `bun test hono-server/src/services/log/internal/materialization/` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-12 | 50k node memory safety | Performance | `bun test materialization/TraceReadModelMaterializer.performance.test.ts` | ❌ Wave 0 |
| D-13 | <5ms/1k nodes speed | Performance | `bun test materialization/TraceReadModelMaterializer.performance.test.ts` | ❌ Wave 0 |
| D-14 | 5,000 level nesting | Stress | `bun test materialization/TraceReadModelMaterializer.stress.test.ts` | ❌ Wave 0 |
| D-15 | Persistence mapping | Integration | `bun test repo/impl/LogReadRepoClickHouse.test.ts` | ✅ |
| D-16 | Massive fan-out (10k) | Stress | `bun test materialization/TraceReadModelMaterializer.stress.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.stress.test.ts` — covers D-14, D-16.
- [ ] `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.performance.test.ts` — covers D-12, D-13.
- [ ] `hono-server/src/services/log/internal/materialization/TraceGenerator.ts` — shared testing utility.

## Sources

### Primary (HIGH confidence)
- `hono-server/src/services/log/internal/materialization/flowOrder.ts` - Implementation audit for complexity analysis.
- `hono-server/src/services/log/internal/repo/impl/test-helpers.ts` - Verified `FakeClickHouseClient` capabilities.
- [npm registry] - `tinyqueue` existence and version verification.

### Secondary (MEDIUM confidence)
- WebSearch - General performance benchmarks for 50k node graphs in JS.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified on registry and project compatibility.
- Architecture: HIGH - Implementation audit completed.
- Pitfalls: HIGH - Complexity analysis of existing code performed.

**Research date:** 2026-06-09
**Valid until:** 2026-07-09

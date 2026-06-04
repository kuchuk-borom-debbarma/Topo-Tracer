import { describe, expect, it } from "bun:test";
import { computeFlowOrder } from "./flowOrder";
import type { ReadNode, ReadEdge } from "../../api/types";

describe("computeFlowOrder", () => {
  const baseNode: Omit<ReadNode, "id" | "startedAt" | "flowOrder"> = {
    userId: "u1",
    traceId: "t1",
    nodeType: "span",
    data: {},
    endedAt: null,
    startMessage: null,
    endMessage: null,
    importanceLevel: 1,
    materializedAt: Date.now(),
  };

  const createNode = (id: string, startedAt: number): ReadNode => ({
    ...baseNode,
    id,
    startedAt,
    flowOrder: 0,
  });

  const createEdge = (fromNodeId: string, toNodeId: string): ReadEdge => ({
    id: `${fromNodeId}->${toNodeId}`,
    userId: "u1",
    traceId: "t1",
    edgeType: "calls",
    fromNodeId,
    toNodeId,
    fromFlowOrder: 0,
    toFlowOrder: 0,
    data: {},
    startedAt: Date.now(),
    endedAt: null,
    materializedAt: Date.now(),
  });

  it("orders siblings by child startedAt, then child id", () => {
    // A -> B
    // A -> C
    // B.startedAt < C.startedAt
    const nodes = [
      createNode("A", 100),
      createNode("B", 200),
      createNode("C", 300),
    ];
    const edges = [
      createEdge("A", "B"),
      createEdge("A", "C"),
    ];

    const { flowOrderByNodeId } = computeFlowOrder({ nodes, edges });
    
    // Topological order should be A, B, C
    expect(flowOrderByNodeId.get("A")).toBe(0);
    expect(flowOrderByNodeId.get("B")).toBe(1);
    expect(flowOrderByNodeId.get("C")).toBe(2);
  });

  it("orders siblings by child id if startedAt is same", () => {
    const nodes = [
      createNode("A", 100),
      createNode("C", 200),
      createNode("B", 200),
    ];
    const edges = [
      createEdge("A", "B"),
      createEdge("A", "C"),
    ];

    const { flowOrderByNodeId } = computeFlowOrder({ nodes, edges });
    
    // Topological order: A, B, C (B comes before C because "B" < "C")
    expect(flowOrderByNodeId.get("A")).toBe(0);
    expect(flowOrderByNodeId.get("B")).toBe(1);
    expect(flowOrderByNodeId.get("C")).toBe(2);
  });

  it("appends disconnected nodes after connected ones, ordered by startedAt then id", () => {
    const nodes = [
      createNode("A", 100),
      createNode("B", 200),
      createNode("D", 50),  // Disconnected, but earlier startedAt
      createNode("C", 300), // Disconnected, later startedAt
    ];
    const edges = [
      createEdge("A", "B"),
    ];

    const { flowOrderByNodeId } = computeFlowOrder({ nodes, edges });
    
    // Connected: A, B
    // Disconnected: D (50), C (300)
    // Combined candidates with tie-breaking:
    // Initial candidates: A(100), D(50), C(300)
    // Sorted candidates: D(50), A(100), C(300)
    // 1. Pop D -> order 0
    // 2. Pop A -> order 1. A has edge to B. B becomes candidate.
    // 3. Candidates: B(200), C(300)
    // 4. Pop B -> order 2
    // 5. Pop C -> order 3
    
    expect(flowOrderByNodeId.get("D")).toBe(0);
    expect(flowOrderByNodeId.get("A")).toBe(1);
    expect(flowOrderByNodeId.get("B")).toBe(2);
    expect(flowOrderByNodeId.get("C")).toBe(3);
  });

  it("handles cycles and self-edges by falling back to startedAt/id order and increments diagCycles", () => {
    // A -> B -> A (Cycle)
    // C -> C (Self-edge)
    const nodes = [
      createNode("A", 100),
      createNode("B", 200),
      createNode("C", 300),
    ];
    const edges = [
      createEdge("A", "B"),
      createEdge("B", "A"),
      createEdge("C", "C"),
    ];

    const { flowOrderByNodeId, diagnostics } = computeFlowOrder({ nodes, edges });
    
    expect(flowOrderByNodeId.size).toBe(3);
    expect(diagnostics.diagCycles).toBeGreaterThan(0);
    
    // Fallback order should be A, B, C based on startedAt
    expect(flowOrderByNodeId.get("A")).toBe(0);
    expect(flowOrderByNodeId.get("B")).toBe(1);
    expect(flowOrderByNodeId.get("C")).toBe(2);
  });

  it("ignores orphan edges and increments diagOrphanEdges", () => {
    const nodes = [
      createNode("A", 100),
      createNode("B", 200),
    ];
    const edges = [
      createEdge("A", "B"),
      createEdge("A", "NON_EXISTENT"),
      createEdge("NON_EXISTENT", "B"),
    ];

    const { flowOrderByNodeId, diagnostics } = computeFlowOrder({ nodes, edges });
    
    expect(flowOrderByNodeId.size).toBe(2);
    expect(flowOrderByNodeId.get("A")).toBe(0);
    expect(flowOrderByNodeId.get("B")).toBe(1);
    expect(diagnostics.diagOrphanEdges).toBe(2);
  });
});

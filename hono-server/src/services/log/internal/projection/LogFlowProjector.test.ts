import { describe, it, expect } from "bun:test";
import { LogFlowProjector } from "./LogFlowProjector";
import { ReadNode, ReadEdge, ProjectionReadCap } from "../../api/types";

describe("LogFlowProjector", () => {
  const userId = "user-1";
  const traceId = "trace-1";
  const nodeCap: ProjectionReadCap = { cap: 100, returnedCount: 0, capHit: false };
  const edgeCap: ProjectionReadCap = { cap: 100, returnedCount: 0, capHit: false };

  const createNode = (id: string, importance: number, flowOrder: number): ReadNode => ({
    id,
    userId,
    traceId,
    nodeType: "span",
    data: {},
    name: null,
    startedAt: 1000 + flowOrder,
    endedAt: 1100 + flowOrder,
    originalStartedAt: 1000 + flowOrder,
    clockSkewMs: 0,
    startMessage: `start ${id}`,
    endMessage: `end ${id}`,
    importanceLevel: importance,
    flowOrder,
    materializedAt: Date.now(),
    groupParentId: null,
    layer: null,
  });

  const createEdge = (id: string, fromId: string, toId: string, fromFlow: number, toFlow: number, type = "child"): ReadEdge => ({
    id,
    userId,
    traceId,
    edgeType: type,
    fromNodeId: fromId,
    toNodeId: toId,
    fromFlowOrder: fromFlow,
    toFlowOrder: toFlow,
    data: {},
    startedAt: 1000 + fromFlow,
    endedAt: 1100 + toFlow,
    originalStartedAt: 1000 + fromFlow,
    clockSkewMs: 0,
    materializedAt: Date.now(),
  });

  const projector = new LogFlowProjector();

  it("threshold visibility: returns nodes with importanceLevel <= threshold", () => {
    const nodes = [
      createNode("n1", 1, 1),
      createNode("n2", 2, 2),
      createNode("n3", 3, 3),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 2,
      nodes,
      edges: [],
      nodeCap,
      edgeCap,
    });

    expect(result.nodes.filter(n => n.kind === "normal")).toHaveLength(2);
    expect(result.nodes.find(n => n.id === "n1")?.kind).toBe("normal");
    expect(result.nodes.find(n => n.id === "n2")?.kind).toBe("normal");
    expect(result.nodes.find(n => n.id === "n3")).toBeUndefined();
    // n3 should be in a ghost
    expect(result.nodes.find(n => n.kind === "ghost")).toBeDefined();
  });

  it("hidden prefix: groups hidden nodes at the start into a ghost", () => {
    const nodes = [
      createNode("n1", 3, 1),
      createNode("n2", 3, 2),
      createNode("n3", 1, 3),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges: [],
      nodeCap,
      edgeCap,
    });

    expect(result.nodes).toHaveLength(2); // 1 ghost, 1 normal
    const ghost = result.nodes.find(n => n.kind === "ghost") as any;
    expect(ghost).toBeDefined();
    expect(ghost.id).toBe(`ghost:${traceId}:1:1:2`);
    expect(ghost.hiddenNodeCount).toBe(2);
    expect(ghost.flowOrderStart).toBe(1);
    expect(ghost.flowOrderEnd).toBe(2);
    expect(result.nodes.find(n => n.id === "n3")?.kind).toBe("normal");
  });

  it("hidden suffix: groups hidden nodes at the end into a ghost", () => {
    const nodes = [
      createNode("n1", 1, 1),
      createNode("n2", 3, 2),
      createNode("n3", 3, 3),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges: [],
      nodeCap,
      edgeCap,
    });

    expect(result.nodes).toHaveLength(2); // 1 normal, 1 ghost
    const ghost = result.nodes.find(n => n.kind === "ghost") as any;
    expect(ghost.id).toBe(`ghost:${traceId}:1:2:3`);
    expect(ghost.hiddenNodeCount).toBe(2);
  });

  it("middle hidden range: groups hidden nodes between visible nodes", () => {
    const nodes = [
      createNode("n1", 1, 1),
      createNode("n2", 3, 2),
      createNode("n3", 3, 3),
      createNode("n4", 1, 4),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges: [],
      nodeCap,
      edgeCap,
    });

    expect(result.nodes).toHaveLength(3); // normal, ghost, normal
    const ghost = result.nodes.find(n => n.kind === "ghost") as any;
    expect(ghost.id).toBe(`ghost:${traceId}:1:2:3`);
  });

  it("all-hidden: returns one ghost when all nodes are hidden", () => {
    const nodes = [
      createNode("n1", 3, 1),
      createNode("n2", 3, 2),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges: [],
      nodeCap,
      edgeCap,
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].kind).toBe("ghost");
    expect(result.nodes[0].id).toBe(`ghost:${traceId}:1:1:2`);
  });

  it("visible-hidden-visible snapping: snaps edges through ghosts", () => {
    const nodes = [
      createNode("n1", 1, 1),
      createNode("n2", 3, 2),
      createNode("n3", 1, 3),
    ];
    const edges = [
      createEdge("e1", "n1", "n2", 1, 2),
      createEdge("e2", "n2", "n3", 2, 3),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges,
      nodeCap,
      edgeCap,
    });

    const ghostId = `ghost:${traceId}:1:2:2`;
    expect(result.edges).toHaveLength(2);
    expect(result.edges).toContainEqual(expect.objectContaining({
      fromNodeId: "n1",
      toNodeId: ghostId,
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      fromNodeId: ghostId,
      toNodeId: "n3",
    }));
  });

  it("same-ghost hidden edge count: increments ghost hiddenEdgeCount and omits self-loop", () => {
    const nodes = [
      createNode("n1", 3, 1),
      createNode("n2", 3, 2),
    ];
    const edges = [
      createEdge("e1", "n1", "n2", 1, 2),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges,
      nodeCap,
      edgeCap,
    });

    expect(result.nodes).toHaveLength(1);
    const ghost = result.nodes[0] as any;
    expect(ghost.hiddenEdgeCount).toBe(1);
    expect(result.edges).toHaveLength(0); // No self-loop
  });

  it("cross-ghost hidden edge: snaps from ghost to ghost", () => {
    const nodes = [
      createNode("n1", 3, 1),
      createNode("n2", 1, 2),
      createNode("n3", 3, 3),
    ];
    const edges = [
      createEdge("e1", "n1", "n3", 1, 3),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges,
      nodeCap,
      edgeCap,
    });

    const ghost1Id = `ghost:${traceId}:1:1:1`;
    const ghost2Id = `ghost:${traceId}:1:3:3`;
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].fromNodeId).toBe(ghost1Id);
    expect(result.edges[0].toNodeId).toBe(ghost2Id);
  });

  it("duplicate snapped edge aggregation: aggregates by from, to, and type", () => {
    const nodes = [
      createNode("n1", 1, 1),
      createNode("n2", 3, 2),
      createNode("n3", 3, 3),
      createNode("n4", 1, 4),
    ];
    // Both edges snap to n1 -> ghost(2:3)
    const edges = [
      createEdge("e1", "n1", "n2", 1, 2, "child"),
      createEdge("e2", "n1", "n3", 1, 3, "child"),
    ];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges,
      nodeCap,
      edgeCap,
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].edgeCount).toBe(2);
  });

  it("orphan edge omission: increments metadata.omittedEdgeCount", () => {
    const nodes = [createNode("n1", 1, 1)];
    const edges = [createEdge("e1", "n1", "orphan", 1, 5)];
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes,
      edges,
      nodeCap,
      edgeCap,
    });

    expect(result.edges).toHaveLength(0);
    expect(result.metadata.omittedEdgeCount).toBe(1);
  });

  it("collapsed group: snaps descendants into one group node", () => {
    const root = createNode("root", 1, 1);
    const child = { ...createNode("child", 1, 2), groupParentId: "root" };
    const edges = [createEdge("e1", "root", "child", 1, 2)];

    const result = projector.project({
      userId,
      traceId,
      threshold: 3,
      nodes: [root, child],
      edges,
      nodeCap,
      edgeCap,
      collapsedGroups: ["root"],
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      kind: "group",
      groupId: "root",
      hiddenNodeCount: 2,
      hiddenEdgeCount: 1,
    });
    expect(result.edges).toHaveLength(0);
  });

  it("collapsed layer: groups same-layer peers and keeps incoming edge", () => {
    const caller = createNode("caller", 1, 1);
    const service = {
      ...createNode("service", 1, 2),
      groupParentId: null,
      layer: { key: "external-services", label: "External Services", order: 3 },
    };
    const edges = [createEdge("e1", "caller", "service", 1, 2)];

    const result = projector.project({
      userId,
      traceId,
      threshold: 3,
      nodes: [caller, service],
      edges,
      nodeCap,
      edgeCap,
      collapsedLayers: ["external-services"],
    });

    expect(result.nodes.find((node) => node.kind === "layer")).toMatchObject({
      kind: "layer",
      hiddenNodeCount: 1,
      layer: { key: "external-services" },
    });
    expect(result.edges).toContainEqual(expect.objectContaining({
      fromNodeId: "caller",
      toNodeId: `layer:${traceId}:external-services`,
    }));
  });

  it("cap metadata propagation: includes cap info in metadata", () => {
    const nodeCapHit: ProjectionReadCap = { cap: 10, returnedCount: 10, capHit: true };
    const result = projector.project({
      userId,
      traceId,
      threshold: 1,
      nodes: [],
      edges: [],
      nodeCap: nodeCapHit,
      edgeCap,
    });

    expect(result.metadata.nodeCap.capHit).toBe(true);
    expect(result.metadata.edgeCap.capHit).toBe(false);
  });
});

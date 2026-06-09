import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { ReadNode, ReadEdge, ReadTraceSummary } from "../../api/types";
import { FakeReadRepo, mockLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Stress Tests", () => {
  it("D-14: handles a 5,000 level deep chain without stack overflow", async () => {
    const repo = new FakeReadRepo();
    const DEPTH = 5000;
    
    const nodeEvents: any[] = [];
    const edgeEvents: any[] = [];
    
    for (let i = 0; i < DEPTH; i++) {
      const id = `node-${i}`;
      // Each node starts at its index, which means it starts before its parent (if i > 0)
      // Node 0: starts at 0
      // Node 1: starts at 1, parent is Node 0 (starts at 0). This is NOT a violation.
      // Wait, to force violation:
      // Node i starts at (DEPTH - i) * 10
      // Node 0 starts at 50000
      // Node 1 starts at 49990, parent Node 0
      // Node 2 starts at 49980, parent Node 1
      nodeEvents.push({
        id,
        user_id: "u1",
        trace_id: "t1",
        event_type: 0,
        started_at_ms: (DEPTH - i) * 10,
        node_type: "span",
        importance_level: 1,
        data: {},
        message: `Node ${i}`,
        ended_at_ms: null
      });
      nodeEvents.push({
        id,
        user_id: "u1",
        trace_id: "t1",
        event_type: 1,
        ended_at_ms: (DEPTH - i) * 10 + 5,
        message: `Node ${i} end`,
        data: {},
        started_at_ms: null,
        node_type: null,
        importance_level: null
      });
      
      if (i > 0) {
        edgeEvents.push({
          id: `edge-${i}`,
          user_id: "u1",
          trace_id: "t1",
          event_type: 0,
          started_at_ms: (DEPTH - i + 1) * 10 + 1,
          edge_type: "child",
          from_node_id: `node-${i - 1}`,
          to_node_id: id,
          data: {},
          ended_at_ms: null
        });
      }
    }

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents,
      edgeEvents
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    expect(savedNodes.length).toBe(DEPTH);

    // Node 0 started at 50000
    // Node 1 should be 50001
    // Node 2 should be 50002
    // ...
    // Node i should be 50000 + i
    const nodeById = new Map<string, ReadNode>(savedNodes.map(n => [n.id, n]));
    for (let i = 0; i < DEPTH; i++) {
      const node = nodeById.get(`node-${i}`)!;
      expect(node.startedAt).toBe(50000 + i);
    }
  });

  it("D-16: handles massive fan-out (10,000 children)", async () => {
    const repo = new FakeReadRepo();
    const CHILDREN = 10000;
    
    const nodeEvents: any[] = [
      { id: "parent", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 1000, node_type: "span", importance_level: 1, data: {}, message: "Parent", ended_at_ms: null },
      { id: "parent", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 2000, message: "Parent end", data: {}, started_at_ms: null, node_type: null, importance_level: null }
    ];
    const edgeEvents: any[] = [];
    
    for (let i = 0; i < CHILDREN; i++) {
      const id = `child-${i}`;
      nodeEvents.push({
        id,
        user_id: "u1",
        trace_id: "t1",
        event_type: 0,
        started_at_ms: 500, // Starts before parent
        node_type: "span",
        importance_level: 1,
        data: {},
        message: `Child ${i}`,
        ended_at_ms: null
      });
      nodeEvents.push({
        id,
        user_id: "u1",
        trace_id: "t1",
        event_type: 1,
        ended_at_ms: 600,
        message: `Child ${i} end`,
        data: {},
        started_at_ms: null,
        node_type: null,
        importance_level: null
      });
      
      edgeEvents.push({
        id: `edge-${i}`,
        user_id: "u1",
        trace_id: "t1",
        event_type: 0,
        started_at_ms: 1100,
        edge_type: "child",
        from_node_id: "parent",
        to_node_id: id,
        data: {},
        ended_at_ms: null
      });
    }

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents,
      edgeEvents
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    expect(savedNodes.length).toBe(CHILDREN + 1);

    const parent = savedNodes.find(n => n.id === "parent")!;
    expect(parent.startedAt).toBe(1000);

    for (const node of savedNodes) {
      if (node.id.startsWith("child-")) {
        expect(node.startedAt).toBe(1001);
      }
    }
  });

  it("D-16: handles massive fan-in (100 parents to 1 child)", async () => {
    const repo = new FakeReadRepo();
    const PARENTS = 100;
    
    const nodeEvents: any[] = [
      { id: "child", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "Child", ended_at_ms: null },
      { id: "child", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 100, message: "Child end", data: {}, started_at_ms: null, node_type: null, importance_level: null }
    ];
    const edgeEvents: any[] = [];
    
    for (let i = 0; i < PARENTS; i++) {
      const id = `parent-${i}`;
      nodeEvents.push({
        id,
        user_id: "u1",
        trace_id: "t1",
        event_type: 0,
        started_at_ms: 100 + i, // Parents start at 100, 101, ...
        node_type: "span",
        importance_level: 1,
        data: {},
        message: `Parent ${i}`,
        ended_at_ms: null
      });
      nodeEvents.push({
        id,
        user_id: "u1",
        trace_id: "t1",
        event_type: 1,
        ended_at_ms: 200 + i,
        message: `Parent ${i} end`,
        data: {},
        started_at_ms: null,
        node_type: null,
        importance_level: null
      });
      
      edgeEvents.push({
        id: `edge-${i}`,
        user_id: "u1",
        trace_id: "t1",
        event_type: 0,
        started_at_ms: 110 + i,
        edge_type: "child",
        from_node_id: id,
        to_node_id: "child",
        data: {},
        ended_at_ms: null
      });
    }

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents,
      edgeEvents
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const child = savedNodes.find(n => n.id === "child")!;

    // Minimum parent start is 100. Child should be 100 + 1 = 101.
    expect(child.startedAt).toBe(101);
  });

  it("D-20: applies skew correction even to ghosted nodes", async () => {
    const repo = new FakeReadRepo();
    
    // Parent A: 100, importance 10 (high)
    // Child B: 50, importance -1 (ghosted)
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 10, data: {}, message: "A", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: -1, data: {}, message: "B", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeB = savedNodes.find(n => n.id === "B")!;

    expect(nodeB.startedAt).toBe(101);
    expect(nodeB.importanceLevel).toBe(-1);
    
    const summary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(summary.diagClockSkew).toBe(1);
  });

  it("D-16: handles extreme skew (child starts 1 hour before parent)", async () => {
    const repo = new FakeReadRepo();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    
    // Parent A: 10,000,000
    // Child B: 10,000,000 - 3,600,000 = 6,400,000
    const parentStart = 10000000;
    const childStart = parentStart - ONE_HOUR_MS;
    const childDuration = 500;

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: parentStart, node_type: "span", importance_level: 1, data: {}, message: "A", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: parentStart + 1000, message: "A", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: childStart, node_type: "span", importance_level: 1, data: {}, message: "B", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: childStart + childDuration, message: "B", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: parentStart + 10, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeB = savedNodes.find(n => n.id === "B")!;

    expect(nodeB.startedAt).toBe(parentStart + 1);
    expect(nodeB.endedAt).toBe(parentStart + 1 + childDuration);
    expect(nodeB.clockSkewMs).toBe(ONE_HOUR_MS + 1);
  });

  it("D-16: handles out-of-order arrival (reverse causal order)", async () => {
    const repo = new FakeReadRepo();
    
    // A -> B -> C
    // Feed events in order: C, B, A
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 20, node_type: "span", importance_level: 1, data: {}, message: "C", ended_at_ms: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 80, message: "C", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e2", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 60, edge_type: "child", from_node_id: "B", to_node_id: "C", data: {}, ended_at_ms: null },
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null },
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeA = savedNodes.find(n => n.id === "A")!;
    const nodeB = savedNodes.find(n => n.id === "B")!;
    const nodeC = savedNodes.find(n => n.id === "C")!;

    expect(nodeA.startedAt).toBe(100);
    expect(nodeB.startedAt).toBe(101);
    expect(nodeC.startedAt).toBe(102);
  });

  it("D-17: ignores cross-trace edges", async () => {
    const repo = new FakeReadRepo();
    
    // Node A: in trace
    // Edge e1: from Node X (NOT in trace) to Node A
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, edge_type: "cross-trace", from_node_id: "X", to_node_id: "A", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeA = savedNodes.find(n => n.id === "A")!;

    // Node A should not be corrected because X is missing
    expect(nodeA.startedAt).toBe(100);
    expect(nodeA.clockSkewMs).toBe(0);

    const savedEdges = (repo.saveReadModel as any).mock.calls[0][0].edges as ReadEdge[];
    // Edge should be filtered out because it refers to a missing node (per applyFlowOrder logic)
    expect(savedEdges.length).toBe(0);
  });

  it("D-21: flags diagLimitExceeded when node count > 50,000", async () => {
    const repo = new FakeReadRepo();
    const COUNT = 50001;
    
    const nodeEvents: any[] = [];
    for (let i = 0; i < COUNT; i++) {
      nodeEvents.push({
        id: `n-${i}`, user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "N", ended_at_ms: null
      });
    }

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents,
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const summary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(summary.diagLimitExceeded).toBe(1);
    expect(summary.nodeCount).toBe(COUNT);
  });

  it("D-21: flags diagLimitExceeded when nesting depth > 5,000", async () => {
    const repo = new FakeReadRepo();
    const DEPTH = 5001; // Limit is 5000
    
    const nodeEvents: any[] = [];
    const edgeEvents: any[] = [];
    
    for (let i = 0; i <= DEPTH; i++) {
      nodeEvents.push({
        id: `n-${i}`, user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100 + i, node_type: "span", importance_level: 1, data: {}, message: "N", ended_at_ms: null
      });
      if (i > 0) {
        edgeEvents.push({
          id: `e-${i}`, user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100 + i, edge_type: "child", from_node_id: `n-${i-1}`, to_node_id: `n-${i}`, data: {}, ended_at_ms: null
        });
      }
    }

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents,
      edgeEvents
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const summary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(summary.diagLimitExceeded).toBe(1);
  });
});

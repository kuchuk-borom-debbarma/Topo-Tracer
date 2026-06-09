import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { ReadNode, ReadEdge, ReadTraceSummary } from "../../api/types";
import { FakeReadRepo, mockLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Clock Skew Correction", () => {
  it("corrects basic child start time violation (D-01, D-02)", async () => {
    const repo = new FakeReadRepo();
    
    // Parent A: starts at 100
    // Child B: starts at 50 (violation! should be at least 101)
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeA = savedNodes.find(n => n.id === "A")!;
    const nodeB = savedNodes.find(n => n.id === "B")!;

    expect(nodeA.startedAt).toBe(100);
    // B should be shifted to parent.startedAt + 1 = 101
    expect(nodeB.startedAt).toBe(101);
    // Delta was 101 - 50 = 51. B.endedAt was 150, so it should be 150 + 51 = 201.
    expect(nodeB.endedAt).toBe(201);
    expect(nodeB.clockSkewMs).toBe(51);
  });

  it("propagates corrections through multiple generations (FR3)", async () => {
    const repo = new FakeReadRepo();
    
    // A (100) -> B (50) -> C (20)
    // Correction:
    // A = 100
    // B = 100 + 1 = 101
    // C = 101 + 1 = 102
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 20, node_type: "span", importance_level: 1, data: {}, message: "C start", ended_at_ms: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 80, message: "C end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null },
        { id: "e2", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 60, edge_type: "child", from_node_id: "B", to_node_id: "C", data: {}, ended_at_ms: null },
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
    
    expect(nodeB.clockSkewMs).toBe(51);
    expect(nodeC.clockSkewMs).toBe(102 - 20);
  });

  it("preserves span duration when shifting startedAt (D-03)", async () => {
    const repo = new FakeReadRepo();
    
    // Parent A: 100
    // Child B: 50-70 (duration 20)
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 70, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
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
    expect(nodeB.endedAt).toBe(121); // 101 + 20
  });

  it("corrects against the earliest parent if multiple exist (D-04)", async () => {
    const repo = new FakeReadRepo();
    
    // Parent A: 100
    // Parent B: 200
    // Child C: 50
    // C has two parents A and B. Min(A.startedAt, B.startedAt) = 100.
    // C should be corrected to 101.
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 200, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 250, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "C start", ended_at_ms: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 80, message: "C end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "C", data: {}, ended_at_ms: null },
        { id: "e2", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 210, edge_type: "child", from_node_id: "B", to_node_id: "C", data: {}, ended_at_ms: null },
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeC = savedNodes.find(n => n.id === "C")!;

    expect(nodeC.startedAt).toBe(101);
  });

  it("ensures causal sequence even in detected cycles (D-05)", async () => {
    const repo = new FakeReadRepo();
    
    // A (100) -> B (50) -> A (not possible via node events, but let's say edges form a cycle)
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null },
        { id: "e2", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 60, edge_type: "child", from_node_id: "B", to_node_id: "A", data: {}, ended_at_ms: null },
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeA = savedNodes.find(n => n.id === "A")!;
    const nodeB = savedNodes.find(n => n.id === "B")!;

    if (nodeA.flowOrder < nodeB.flowOrder) {
        expect(nodeB.startedAt).toBeGreaterThan(nodeA.startedAt);
    } else {
        expect(nodeA.startedAt).toBeGreaterThan(nodeB.startedAt);
    }
  });

  it("does not shift if timestamps are already causally correct", async () => {
    const repo = new FakeReadRepo();
    
    // A: 100, B: 110. A -> B is OK.
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 210, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 105, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeB = savedNodes.find(n => n.id === "B")!;

    expect(nodeB.startedAt).toBe(110);
    expect(nodeB.clockSkewMs).toBe(0);
  });

  it("populates originalStartedAt and clockSkewMs correctly (D-10)", async () => {
    const repo = new FakeReadRepo();
    
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A start", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B start", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B end", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const nodeB = savedNodes.find(n => n.id === "B")!;

    expect(nodeB.originalStartedAt).toBe(50);
    expect(nodeB.clockSkewMs).toBe(51);
    expect(nodeB.startedAt).toBe(101);
  });

  it("increments diagClockSkew accurately (FR5)", async () => {
    const repo = new FakeReadRepo();
    
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "A", ended_at_ms: null },
        { id: "A", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "A", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "B", ended_at_ms: null },
        { id: "B", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "B", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "C", ended_at_ms: null },
        { id: "C", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "C", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "D", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 50, node_type: "span", importance_level: 1, data: {}, message: "D", ended_at_ms: null },
        { id: "D", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 150, message: "D", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "E", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", importance_level: 1, data: {}, message: "E", ended_at_ms: null },
        { id: "E", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "E", data: {}, started_at_ms: null, node_type: null, importance_level: null },
        { id: "F", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, node_type: "span", importance_level: 1, data: {}, message: "F", ended_at_ms: null },
        { id: "F", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 210, message: "F", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "A", to_node_id: "B", data: {}, ended_at_ms: null },
        { id: "e2", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "C", to_node_id: "D", data: {}, ended_at_ms: null },
        { id: "e3", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "child", from_node_id: "E", to_node_id: "F", data: {}, ended_at_ms: null },
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;

    expect(savedSummary.diagClockSkew).toBe(2);
  });
});

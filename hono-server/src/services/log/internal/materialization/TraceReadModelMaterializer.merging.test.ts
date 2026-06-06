import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { ReadNode, ReadTraceSummary, ReadCheckpoint } from "../../api/types";
import { FakeReadRepo, mockLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Event Merging and Diagnostics", () => {
  it("merges raw events into existing state and increments diagnostics", async () => {
    const repo = new FakeReadRepo();
    
    // Existing node n1 (started but not ended)
    const existingNode: ReadNode = {
      id: "n1", userId: "u1", traceId: "t1", nodeType: "span", data: {},
      startedAt: 100, endedAt: null, startMessage: "start", endMessage: null,
      importanceLevel: 1, flowOrder: 0, materializedAt: 500
    };
    
    repo.loadLatestReadModel.mockResolvedValue({
      nodes: [existingNode],
      edges: [],
      summary: null
    });

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        {
          id: "n1", user_id: "u1", trace_id: "t1", event_type: 1,
          ended_at_ms: 200, message: "end", data: {},
          started_at_ms: null, node_type: null, importance_level: null
        },
        {
          id: "n2", user_id: "u1", trace_id: "t1", event_type: 0,
          started_at_ms: 150, node_type: "span", importance_level: 2, data: {}, message: "n2 start",
          ended_at_ms: null
        },
        {
          id: "n3", user_id: "u1", trace_id: "t1", event_type: 1,
          ended_at_ms: 300, message: "n3 end", data: {},
          started_at_ms: null, node_type: null, importance_level: null
        }
      ],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedNodes = (repo.saveReadModel as any).mock.calls[0][0].nodes as ReadNode[];
    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;

    expect(savedNodes).toHaveLength(2);
    expect(savedNodes.find(n => n.id === "n1")?.endedAt).toBe(200);
    expect(savedNodes.find(n => n.id === "n2")?.startedAt).toBe(150);
    expect(savedSummary.diagMissingStarts).toBe(1);
  });

  it("uses diagnose-and-continue for after-checkpoint negative durations", async () => {
    const repo = new FakeReadRepo();
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        {
          id: "n1", user_id: "u1", trace_id: "t1", event_type: 0,
          started_at_ms: 200, node_type: "span", data: {}, message: "s",
          importance_level: 1, ended_at_ms: null,
        },
        {
          id: "n1", user_id: "u1", trace_id: "t1", event_type: 1,
          ended_at_ms: 100, message: "e", data: {},
          started_at_ms: null, node_type: null, importance_level: null,
        },
      ],
      edgeEvents: [],
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(savedSummary.diagNegativeDurations).toBe(1);
  });

  it("handles checkpoint advancement correctly", async () => {
    const repo = new FakeReadRepo();
    
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "n1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", data: {}, message: "s", importance_level: 1, ended_at_ms: null },
        { id: "n1", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "e", data: {}, started_at_ms: null, node_type: null, importance_level: null }
      ],
      edgeEvents: [
        { id: "e1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 110, edge_type: "c", from_node_id: "n1", to_node_id: "n1", data: {}, ended_at_ms: null }
      ]
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedCheckpoint = (repo.saveCheckpoint as any).mock.calls[0][0].checkpoint as ReadCheckpoint;
    
    expect(savedCheckpoint.lastNodeEventTime).toBe(200);
    expect(savedCheckpoint.lastNodeEventId).toBe("n1");
    expect(savedCheckpoint.lastNodeEventType).toBe(1);
    expect(savedCheckpoint.lastEdgeEventTime).toBe(110);
    expect(savedCheckpoint.lastEdgeEventId).toBe("e1");
  });
});

import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { ReadNode, ReadTraceSummary } from "../../api/types";
import { FakeReadRepo, mockLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Trace Name Extraction", () => {
  it("extracts trace name from trace start event", async () => {
    const repo = new FakeReadRepo();
    
    repo.loadTraceEventsAfterCheckpoint.mockResolvedValue([
      {
        user_id: "u1", trace_id: "t1", event_type: 0,
        name: "My Awesome Trace", importance_labels: {}, timestamp_ms: 100
      }
    ]);

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        {
          id: "root-1", user_id: "u1", trace_id: "t1", event_type: 0,
          started_at_ms: 100, node_type: "root", importance_level: 1, data: {}, 
          message: "start", ended_at_ms: null
        }
      ],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(savedSummary.name).toBe("My Awesome Trace");
  });

  it("extracts importance labels from trace start event", async () => {
    const repo = new FakeReadRepo();
    
    repo.loadTraceEventsAfterCheckpoint.mockResolvedValue([
      {
        user_id: "u1", trace_id: "t1", event_type: 0,
        name: "Named Trace", importance_labels: { 0: "Database", 1: "API" }, timestamp_ms: 100
      }
    ]);

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [{ id: "n1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "n", importance_level: 0, data: {}, message: "m", ended_at_ms: null }],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(savedSummary.importanceLabels).toEqual({ 0: "Database", 1: "API" });
  });

  it("preserves existing trace name if no new trace events are provided", async () => {
    const repo = new FakeReadRepo();
    
    repo.loadLatestReadModel.mockResolvedValue({
      nodes: [],
      edges: [],
      summary: { name: "Existing Name", importanceLabels: { 0: "Old" } } as any
    });

    repo.loadTraceEventsAfterCheckpoint.mockResolvedValue([]);
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [{ id: "n2", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 200, node_type: "n", importance_level: 2, data: {}, message: "m", ended_at_ms: null }],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(savedSummary.name).toBe("Existing Name");
    expect(savedSummary.importanceLabels).toEqual({ 0: "Old" });
  });

  it("updates trace metadata incrementally", async () => {
    const repo = new FakeReadRepo();
    
    // Existing summary with old name
    repo.loadLatestReadModel.mockResolvedValue({
      nodes: [],
      edges: [],
      summary: { name: "Old Name", importanceLabels: { 0: "Old" } } as any
    });

    // New trace event arrives
    repo.loadTraceEventsAfterCheckpoint.mockResolvedValue([
      {
        user_id: "u1", trace_id: "t1", event_type: 0,
        name: "New Name", importance_labels: { 1: "New" }, timestamp_ms: 500
      }
    ]);

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [{ id: "n3", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 300, node_type: "n", importance_level: 1, data: {}, message: "m", ended_at_ms: null }],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const savedSummary = (repo.saveReadModel as any).mock.calls[0][0].summary as ReadTraceSummary;
    expect(savedSummary.name).toBe("New Name");
    // Should merge labels
    expect(savedSummary.importanceLabels).toEqual({ 0: "Old", 1: "New" });
  });
});

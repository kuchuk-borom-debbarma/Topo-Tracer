import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { ReadCheckpoint } from "../../api/types";
import { FakeReadRepo, mockLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Authoritative Boundaries", () => {
  it("performs no writes when there are no raw events", async () => {
    const repo = new FakeReadRepo();
    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);

    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    expect(repo.loadCheckpoint).toHaveBeenCalled();
    expect(repo.loadRawEventsAfterCheckpoint).toHaveBeenCalled();
    expect(repo.saveReadModel).not.toHaveBeenCalled();
    expect(repo.saveCheckpoint).not.toHaveBeenCalled();
  });

  it("checkpoint boundary is authoritative when no post-checkpoint events are returned", async () => {
    const repo = new FakeReadRepo();
    const checkpoint: ReadCheckpoint = {
      userId: "u1",
      traceId: "t1",
      lastTraceEventTime: 0, lastNodeEventTime: 200,
      lastNodeEventId: "n1",
      lastNodeEventType: 1,
      lastEdgeEventTime: 0,
      lastEdgeEventId: "",
      lastEdgeEventType: 0,
      checkpointedAt: 900,
    };
    repo.loadCheckpoint.mockResolvedValue(checkpoint);
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [],
      edgeEvents: [],
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    expect(repo.loadRawEventsAfterCheckpoint).toHaveBeenCalledWith({
      userId: "u1",
      traceId: "t1",
      checkpoint,
    });
    expect(repo.saveReadModel).not.toHaveBeenCalled();
    expect(repo.saveCheckpoint).not.toHaveBeenCalled();
  });

  it("calls saveReadModel then saveCheckpoint in order", async () => {
    const repo = new FakeReadRepo();
    const callOrder: string[] = [];
    repo.saveReadModel.mockImplementation(async () => { callOrder.push("saveReadModel"); });
    repo.saveCheckpoint.mockImplementation(async () => { callOrder.push("saveCheckpoint"); });
    
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [{
        id: "n1", user_id: "u1", trace_id: "t1", event_type: 0,
        started_at_ms: 100, node_type: "span", data: {}, message: "start",
        importance_level: 1, ended_at_ms: null
      }],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    expect(callOrder).toEqual(["saveReadModel", "saveCheckpoint"]);
  });
});

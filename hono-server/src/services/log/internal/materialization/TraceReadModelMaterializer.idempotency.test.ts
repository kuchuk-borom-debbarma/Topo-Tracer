import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { FakeReadRepo, mockLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Idempotency and Retries", () => {
  it("retries and rewrites if saveCheckpoint fails", async () => {
    const repo = new FakeReadRepo();
    repo.saveCheckpoint.mockImplementationOnce(async () => { throw new Error("checkpoint fail"); });

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [{ id: "n1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", data: {}, message: "s", importance_level: 1, ended_at_ms: null }],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    
    await expect(materializer.materializeTrace({ userId: "u1", traceId: "t1" })).rejects.toThrow("checkpoint fail");
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });
    
    expect(repo.saveReadModel).toHaveBeenCalledTimes(2);
    expect(repo.saveCheckpoint).toHaveBeenCalledTimes(2);
  });
});

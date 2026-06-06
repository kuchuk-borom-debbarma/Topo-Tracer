import { describe, expect, it } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { FakeReadRepo, createCapturedLogger } from "./test-helpers";

describe("TraceReadModelMaterializer - Observability", () => {
  it("logs materialization as a safe scalar summary without raw payloads", async () => {
    const repo = new FakeReadRepo();
    const { logger, capturedLogs } = createCapturedLogger();
    let now = 1000;
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        { id: "n1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", data: {}, message: "s", importance_level: 1, ended_at_ms: null },
        { id: "n1", user_id: "u1", trace_id: "t1", event_type: 1, ended_at_ms: 200, message: "e", data: {}, started_at_ms: null, node_type: null, importance_level: null },
      ],
      edgeEvents: [],
    });

    const materializer = new TraceReadModelMaterializer(logger, repo, () => now++);
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    const materializedLog = capturedLogs.find((log) => log.args.includes("Materialized trace"));
    expect(materializedLog).toBeDefined();
    const metadata = materializedLog!.args.find((arg: any) => typeof arg === "object");

    expect(metadata).toMatchObject({
      userId: "u1",
      traceId: "t1",
      nodeCount: 1,
      edgeCount: 0,
      rawNodeEventCount: 2,
      rawEdgeEventCount: 0,
    });
    expect(typeof metadata.durationMs).toBe("number");

    for (const forbiddenKey of [
      "nodes", "edges", "events", "nodeEvents", "edgeEvents", "rows", "requestBody", "summary", "diagnostics", "data",
    ]) {
      expect(metadata[forbiddenKey]).toBeUndefined();
    }
  });
});

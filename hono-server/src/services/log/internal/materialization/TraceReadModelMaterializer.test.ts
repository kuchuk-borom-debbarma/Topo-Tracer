import { describe, expect, it, mock } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { ReadCheckpoint, ReadNode, ReadEdge, ReadTraceSummary } from "../../api/types";
import { Logger } from "tslog";
import { readFileSync } from "fs";
import { join } from "path";

class FakeRepo extends ILogReadRepo {
  loadCheckpoint = mock(async () => null as ReadCheckpoint | null) as any;
  loadLatestReadModel = mock(async () => ({ nodes: [], edges: [], summary: null })) as any;
  loadRawEventsAfterCheckpoint = mock(async () => ({ nodeEvents: [], edgeEvents: [] })) as any;
  saveReadModel = mock(async () => {}) as any;
  saveCheckpoint = mock(async () => {}) as any;
}

const mockLogger = {
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
  getSubLogger: mock(() => mockLogger),
} as unknown as Logger<unknown>;

const createCapturedLogger = (): {
  logger: Logger<unknown>;
  capturedLogs: { level: string; args: any[] }[];
} => {
  const capturedLogs: { level: string; args: any[] }[] = [];
  const logger = new Logger({ name: "TraceReadModelMaterializerTest", type: "hidden" });
  logger.attachTransport((logObj: any) => {
    const args: any[] = [];
    for (let i = 0; logObj[i] !== undefined; i++) {
      args.push(logObj[i]);
    }
    capturedLogs.push({
      level: logObj._meta.logLevelName,
      args,
    });
  });

  return { logger, capturedLogs };
};

describe("TraceReadModelMaterializer", () => {
  it("performs no writes when there are no raw events", async () => {
    const repo = new FakeRepo();
    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);

    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });

    expect(repo.loadCheckpoint).toHaveBeenCalled();
    expect(repo.loadRawEventsAfterCheckpoint).toHaveBeenCalled();
    expect(repo.saveReadModel).not.toHaveBeenCalled();
    expect(repo.saveCheckpoint).not.toHaveBeenCalled();
  });

  it("checkpoint boundary is authoritative when no post-checkpoint events are returned", async () => {
    const repo = new FakeRepo();
    const checkpoint: ReadCheckpoint = {
      userId: "u1",
      traceId: "t1",
      lastNodeEventTime: 200,
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
    const repo = new FakeRepo();
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

  it("merges raw events into existing state and increments diagnostics", async () => {
    const repo = new FakeRepo();
    
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
        // n1 end
        {
          id: "n1", user_id: "u1", trace_id: "t1", event_type: 1,
          ended_at_ms: 200, message: "end", data: {},
          started_at_ms: null, node_type: null, importance_level: null
        },
        // n2 start
        {
          id: "n2", user_id: "u1", trace_id: "t1", event_type: 0,
          started_at_ms: 150, node_type: "span", importance_level: 2, data: {}, message: "n2 start",
          ended_at_ms: null
        },
        // n3 end without start (diagnostic)
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

    expect(savedNodes).toHaveLength(2); // n1, n2. n3 is ignored because missing start.
    
    const n1 = savedNodes.find(n => n.id === "n1");
    expect(n1?.endedAt).toBe(200);
    expect(n1?.endMessage).toBe("end");

    const n2 = savedNodes.find(n => n.id === "n2");
    expect(n2?.startedAt).toBe(150);
    expect(n2?.importanceLevel).toBe(2);

    expect(savedSummary.diagMissingStarts).toBe(1); // n3
  });

  it("uses diagnose-and-continue for after-checkpoint negative durations", async () => {
    const repo = new FakeRepo();
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [
        {
          id: "n1",
          user_id: "u1",
          trace_id: "t1",
          event_type: 0,
          started_at_ms: 200,
          node_type: "span",
          data: {},
          message: "start",
          importance_level: 1,
          ended_at_ms: null,
        },
        {
          id: "n1",
          user_id: "u1",
          trace_id: "t1",
          event_type: 1,
          ended_at_ms: 100,
          message: "end before start",
          data: {},
          started_at_ms: null,
          node_type: null,
          importance_level: null,
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
    const repo = new FakeRepo();
    
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
    expect(savedCheckpoint.lastEdgeEventType).toBe(0);
  });

  it("retries and rewrites if saveCheckpoint fails", async () => {
    // This test is tricky because materializer doesn't have internal retry loop, 
    // but the plan says "A retry with the same old checkpoint rewrites replacement rows".
    // This probably means calling materializer twice with same initial state.
    
    const repo = new FakeRepo();
    repo.saveCheckpoint.mockImplementationOnce(async () => { throw new Error("checkpoint fail"); });

    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({
      nodeEvents: [{ id: "n1", user_id: "u1", trace_id: "t1", event_type: 0, started_at_ms: 100, node_type: "span", data: {}, message: "s", importance_level: 1, ended_at_ms: null }],
      edgeEvents: []
    });

    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    
    // First attempt fails at checkpoint
    await expect(materializer.materializeTrace({ userId: "u1", traceId: "t1" })).rejects.toThrow("checkpoint fail");
    
    // Second attempt should still work from same checkpoint
    await materializer.materializeTrace({ userId: "u1", traceId: "t1" });
    
    expect(repo.saveReadModel).toHaveBeenCalledTimes(2);
    expect(repo.saveCheckpoint).toHaveBeenCalledTimes(2);
  });

  it("logs materialization as a safe scalar summary without raw payloads", async () => {
    const repo = new FakeRepo();
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
      diagMissingStarts: 0,
      diagMissingEnds: 0,
      diagNegativeDurations: 0,
      diagCycles: 0,
      diagOrphanEdges: 0,
      diagInvalidImportance: 0,
      diagClockSkew: 0,
    });
    expect(typeof metadata.durationMs).toBe("number");

    for (const forbiddenKey of [
      "nodes",
      "edges",
      "events",
      "nodeEvents",
      "edgeEvents",
      "rows",
      "requestBody",
      "summary",
      "diagnostics",
      "data",
    ]) {
      expect(metadata[forbiddenKey]).toBeUndefined();
    }
  });

  it("source assertion: materializer does not log a full summary as diagnostics", () => {
    const filePath = join(process.cwd(), "src/services/log/internal/materialization/TraceReadModelMaterializer.ts");
    const content = readFileSync(filePath, "utf-8");

    expect(content).not.toContain("diagnostics: summary");
  });
});

import { describe, expect, test } from "bun:test";
import { Logger } from "tslog";
// @ts-ignore
import { readFileSync } from "fs";
// @ts-ignore
import { join } from "path";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type {
  EventBusHandler,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../../../../infra/event-bus/api/types";
import type {
  IngestEdgeStart,
  BoundedProjectionNodesResult,
  BoundedVisibleEdgesResult,
  ReadCheckpoint,
  ReadNode,
  ReadEdge,
  ReadTraceSummary,
} from "../../api/types";
import type { ILogWriteRepo } from "../repo/ILogWriteRepo";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { LogServiceImpl } from "./LogServiceImpl";
import { LogGraphProjector } from "../projection/LogGraphProjector";

type IngestInput = Parameters<LogServiceImpl["ingestNodesNEdges"]>[0];

class FakeLogWriteRepo implements ILogWriteRepo {
  calls: IngestInput[] = [];
  nextError: Error | null = null;

  async ingestNodesNEdges(data: IngestInput): Promise<void> {
    this.calls.push(data);
    if (this.nextError) {
      throw this.nextError;
    }
  }
}

class FakeLogReadRepo extends ILogReadRepo {
  loadBoundedProjectionNodesCalls: any[] = [];
  loadBoundedVisibleEdgesCalls: any[] = [];

  async loadCheckpoint(): Promise<ReadCheckpoint | null> { return null; }
  async loadLatestReadModel(): Promise<{ nodes: ReadNode[]; edges: ReadEdge[]; summary: ReadTraceSummary | null; }> {
    throw new Error("loadLatestReadModel should not be called in projection orchestration");
  }
  async loadRawEventsAfterCheckpoint(): Promise<{ nodeEvents: any[]; edgeEvents: any[]; }> {
    return { nodeEvents: [], edgeEvents: [] };
  }
  async saveReadModel(): Promise<void> {}
  async saveCheckpoint(): Promise<void> {}
  async loadBoundedVisibleNodes(): Promise<any> { return { nodes: [], cap: { cap: 0, returnedCount: 0, capHit: false } }; }

  async loadBoundedVisibleEdges(params: { userId: string; traceId: string; nodeIds: string[]; }): Promise<BoundedVisibleEdgesResult> {
    this.loadBoundedVisibleEdgesCalls.push(params);
    return {
      edges: [],
      cap: { cap: 2000, returnedCount: 0, capHit: false }
    };
  }

  async loadBoundedProjectionNodes(params: { userId: string; traceId: string; }): Promise<BoundedProjectionNodesResult> {
    this.loadBoundedProjectionNodesCalls.push(params);
    return {
      nodes: [
        { id: "node-1", userId: params.userId, traceId: params.traceId, importanceLevel: 1, flowOrder: 1, materializedAt: 100 } as ReadNode
      ],
      cap: { cap: 500, returnedCount: 1, capHit: true }
    };
  }
}

class FakeEventBus implements IEventBus {
  published: EventBusPublishEvent[][] = [];
  publishOptions: (EventBusPublishOptions | undefined)[] = [];

  async publish(
    events: EventBusPublishEvent[],
    options?: EventBusPublishOptions,
  ): Promise<void> {
    this.published.push(events);
    this.publishOptions.push(options);
  }

  async subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void> {
    void options;
    void handler;
  }
}

describe("LogServiceImpl edge endpoint validation", () => {
  test("rejects a missing fromNodeId before persistence", async () => {
    const { service, writeRepo, eventBus } = createSubject();
    const edgeStart = createEdgeStart({ fromNodeId: undefined });

    await expect(
      service.ingestNodesNEdges(createIngestInput([edgeStart])),
    ).rejects.toThrow("Edge start requires fromNodeId and toNodeId.");

    expect(writeRepo.calls).toHaveLength(0);
    expect(eventBus.published).toHaveLength(0);
  });

  test("rejects blank endpoint strings before publish", async () => {
    const { service, writeRepo, eventBus } = createSubject();
    const edgeStart = createEdgeStart({
      fromNodeId: "node-a",
      toNodeId: "   ",
    });

    await expect(
      service.ingestNodesNEdges(createIngestInput([edgeStart])),
    ).rejects.toThrow("Edge start requires fromNodeId and toNodeId.");

    expect(writeRepo.calls).toHaveLength(0);
    expect(eventBus.published).toHaveLength(0);
  });

  test("accepts self-edges with non-empty endpoints", async () => {
    const { service, writeRepo, eventBus } = createSubject();
    const edgeStart = createEdgeStart({
      fromNodeId: "node-a",
      toNodeId: "node-a",
    });

    await service.ingestNodesNEdges(createIngestInput([edgeStart]));

    expect(writeRepo.calls).toHaveLength(1);
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0]?.[0]).toMatchObject({
      topic: "log.trace.ingested",
      key: "trace-1",
      data: {
        userId: "user-1",
        traceId: "trace-1",
      },
    });
  });

  test("does not publish when persistence fails", async () => {
    const { service, writeRepo, eventBus } = createSubject();
    writeRepo.nextError = new Error("insert failed");
    const edgeStart = createEdgeStart();

    await expect(
      service.ingestNodesNEdges(createIngestInput([edgeStart])),
    ).rejects.toThrow("insert failed");

    expect(writeRepo.calls).toHaveLength(1);
    expect(eventBus.published).toHaveLength(0);
  });
});

describe("LogServiceImpl projection orchestration", () => {
  test("projectTraceGraph orchestrates bounded reads and projector", async () => {
    const { service, readRepo, capturedLogs } = createSubject();

    const result = await service.projectTraceGraph({
      userId: "u1",
      traceId: "trace-1",
      threshold: 2
    });

    expect(readRepo.loadBoundedProjectionNodesCalls).toHaveLength(1);
    expect(readRepo.loadBoundedProjectionNodesCalls[0]).toEqual({
      userId: "u1",
      traceId: "trace-1"
    });

    expect(readRepo.loadBoundedVisibleEdgesCalls).toHaveLength(1);
    expect(readRepo.loadBoundedVisibleEdgesCalls[0]).toEqual({
      userId: "u1",
      traceId: "trace-1",
      nodeIds: ["node-1"]
    });

    expect(result).toBeDefined();
    expect(result.metadata.nodeCap.capHit).toBe(true);
    expect(result.metadata.edgeCap.capHit).toBe(false);
    expect(result.metadata.threshold).toBe(2);

    // Logging assertion
    const projectionLog = capturedLogs.find(l => l.args.includes("projectTraceGraph"));
    expect(projectionLog).toBeDefined();
    const metadata = projectionLog!.args.find((a: any) => typeof a === "object");
    expect(metadata).toMatchObject({
      userId: "u1",
      traceId: "trace-1",
      threshold: 2,
      nodeCapHit: true,
      edgeCapHit: false,
    });
    expect(metadata.returnedNodeCount).toBeDefined();
    expect(metadata.returnedEdgeCount).toBeDefined();
    expect(metadata.visibleNodeCount).toBeDefined();
    expect(metadata.ghostNodeCount).toBeDefined();
    expect(metadata.omittedEdgeCount).toBeDefined();
    
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

  test("source assertion: projectTraceGraph does not contain loadLatestReadModel", () => {
    const filePath = join(process.cwd(), "src/services/log/internal/service-impl/LogServiceImpl.ts");
    const content = readFileSync(filePath, "utf-8");
    
    // Find projectTraceGraph method body
    const methodMatch = content.match(/async projectTraceGraph[\s\S]*?\{([\s\S]*?)\n  \}/);
    expect(methodMatch).not.toBeNull();
    const methodBody = methodMatch![1];
    expect(methodBody).not.toContain("loadLatestReadModel");
  });

  test("source assertion: projectTraceGraph log metadata contains no raw payload keys", () => {
    const filePath = join(process.cwd(), "src/services/log/internal/service-impl/LogServiceImpl.ts");
    const content = readFileSync(filePath, "utf-8");
    const logMatch = content.match(/this\.logger\.trace\("projectTraceGraph", \{([\s\S]*?)\n    \}\);/);

    expect(logMatch).not.toBeNull();
    const logMetadata = logMatch![1];
    for (const forbiddenPattern of [
      "nodes:",
      "edges:",
      "events:",
      "nodeEvents:",
      "edgeEvents:",
      "rows:",
      "requestBody:",
      "summary:",
      "diagnostics:",
      "data:",
    ]) {
      expect(logMetadata).not.toContain(forbiddenPattern);
    }
  });
});

const createSubject = (): {
  service: LogServiceImpl;
  writeRepo: FakeLogWriteRepo;
  readRepo: FakeLogReadRepo;
  eventBus: FakeEventBus;
  logger: Logger<unknown>;
  capturedLogs: { level: string; args: any[] }[];
} => {
  const capturedLogs: { level: string; args: any[] }[] = [];
  const logger = new Logger({ name: "LogServiceImplTest", type: "hidden" });
  logger.attachTransport((logObj: any) => {
    const args: any[] = [];
    for (let i = 0; logObj[i] !== undefined; i++) {
      args.push(logObj[i]);
    }
    capturedLogs.push({
      level: logObj._meta.logLevelName,
      args
    });
  });

  const writeRepo = new FakeLogWriteRepo();
  const readRepo = new FakeLogReadRepo();
  const eventBus = new FakeEventBus();
  const projector = new LogGraphProjector();
  const service = new LogServiceImpl(logger, eventBus, writeRepo, readRepo, projector);

  return { service, writeRepo, readRepo, eventBus, logger, capturedLogs };
};

const createIngestInput = (edgeStarts: IngestEdgeStart[]): IngestInput => ({
  userId: "user-1",
  nodeStarts: [],
  edgeStarts,
  nodeEnds: [],
  edgeEnds: [],
});

const createEdgeStart = (
  overrides: Partial<Record<keyof IngestEdgeStart, unknown>> = {},
): IngestEdgeStart => ({
  id: "edge-1",
  traceId: "trace-1",
  edgeType: "calls",
  fromNodeId: "node-a",
  toNodeId: "node-b",
  data: {
    label: "calls",
  },
  startedAt: 1000,
  ...overrides,
} as unknown as IngestEdgeStart);

import { mock, describe, expect, test } from "bun:test";
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
  ReadCheckpoint,
  ReadNode,
  ReadEdge,
  ReadTraceSummary,
  BoundedVisibleEdgesResult,
  PagingParams,
  PagedResult,
} from "../../api/types";
import type { ILogWriteRepo } from "../repo/ILogWriteRepo";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { LogServiceImpl } from "./LogServiceImpl";
import { LogFlowProjector } from "../projection/LogFlowProjector";

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
  loadTraceEventsAfterCheckpoint = mock(async () => []) as any;
  loadBoundedProjectionNodesCalls: any[] = [];
  loadBoundedVisibleEdgesCalls: any[] = [];
  loadTraceSummariesCalls: any[] = [];
  loadTraceSummaryResult: ReadTraceSummary | null = {
    userId: "u1",
    traceId: "trace-1",
    name: "trace-1",
    importanceLabels: {},
    nodeCount: 1,
    edgeCount: 0,
    materializedAt: 100,
    startedAt: 100,
    endedAt: 200,
    minImportanceLevel: 1,
    maxImportanceLevel: 1,
    diagMissingStarts: 0,
    diagMissingEnds: 0,
    diagNegativeDurations: 0,
    diagCycles: 0,
    diagOrphanEdges: 0,
    diagInvalidImportance: 0,
    diagClockSkew: 0,
    diagLimitExceeded: 0,
  };
  loadBoundedProjectionNodesResult: PagedResult<ReadNode> | null = null;

  async loadCheckpoint(): Promise<ReadCheckpoint | null> { return null; }
  async loadLatestReadModel(): Promise<{ nodes: ReadNode[]; edges: ReadEdge[]; summary: ReadTraceSummary | null; }> {
    throw new Error("loadLatestReadModel should not be called in projection orchestration");
  }
  async loadRawEventsAfterCheckpoint(): Promise<{ nodeEvents: any[]; edgeEvents: any[]; }> {
    return { nodeEvents: [], edgeEvents: [] };
  }
  async saveReadModel(): Promise<void> {}
  async saveCheckpoint(): Promise<void> {}
  async loadBoundedVisibleNodes(): Promise<PagedResult<ReadNode>> {
    return { items: [], totalCount: 0, hasMore: false };
  }

  async loadBoundedVisibleEdges(params: { userId: string; traceId: string; nodeIds: string[]; }): Promise<BoundedVisibleEdgesResult> {
    this.loadBoundedVisibleEdgesCalls.push(params);
    return {
      edges: [],
      cap: { cap: 2000, returnedCount: 0, capHit: false }
    };
  }

  async loadBoundedProjectionNodes(params: { userId: string; traceId: string; paging: PagingParams; }): Promise<PagedResult<ReadNode>> {
    this.loadBoundedProjectionNodesCalls.push(params);
    if (this.loadBoundedProjectionNodesResult) {
      return this.loadBoundedProjectionNodesResult;
    }
    return {
      items: [
        { id: "node-1", userId: params.userId, traceId: params.traceId, importanceLevel: 1, flowOrder: 1, materializedAt: 100 } as ReadNode
      ],
      totalCount: 1,
      hasMore: true
    };
  }

  async loadTraceSummary(params: { userId: string; traceId: string; }): Promise<ReadTraceSummary | null> {
    return this.loadTraceSummaryResult;
  }

  async loadTraceSummaries(params: any): Promise<PagedResult<ReadTraceSummary>> {
    this.loadTraceSummariesCalls.push(params);
    return {
      items: this.loadTraceSummaryResult ? [this.loadTraceSummaryResult] : [],
      totalCount: this.loadTraceSummaryResult ? 1 : 0,
      hasMore: false,
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

  test("accepts self-edges with non-empty endpoints and publishes reactively", async () => {
    const { service, writeRepo, eventBus } = createSubject();
    const edgeStart = createEdgeStart({
      fromNodeId: "node-a",
      toNodeId: "node-a",
    });

    await service.ingestNodesNEdges(createIngestInput([edgeStart]));

    expect(writeRepo.calls).toHaveLength(0);
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0]?.[0]).toMatchObject({
      topic: "log.telemetry.received",
      key: "user-1",
      data: {
        userId: "user-1",
        edgeStarts: [edgeStart],
      },
    });
  });
});

describe("LogServiceImpl projection orchestration", () => {
  test("projectTraceFlow orchestrates bounded reads and projector", async () => {
    const { service, readRepo, capturedLogs } = createSubject();

    const result = await service.projectTraceFlow({
      userId: "u1",
      traceId: "trace-1",
      threshold: 2
    });

    expect(readRepo.loadBoundedProjectionNodesCalls).toHaveLength(1);
    expect(readRepo.loadBoundedProjectionNodesCalls[0]).toEqual({
      userId: "u1",
      traceId: "trace-1",
      paging: { offset: 0, limit: 500 }
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
    const projectionLog = capturedLogs.find(l => l.args.includes("projectTraceFlow"));
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

  test("source assertion: projectTraceFlow does not contain loadLatestReadModel", () => {
    // @ts-ignore
    const currentDir = import.meta.dir;
    const filePath = join(currentDir, "LogServiceImpl.ts");
    const content = readFileSync(filePath, "utf-8");
    
    // Find projectTraceFlow method body
    const methodMatch = content.match(/async projectTraceFlow[\s\S]*?\{([\s\S]*?)\n  \}/);
    expect(methodMatch).not.toBeNull();
    const methodBody = methodMatch![1];
    expect(methodBody).not.toContain("loadLatestReadModel");
  });

  test("source assertion: projectTraceFlow log metadata contains no raw payload keys", () => {
    // @ts-ignore
    const currentDir = import.meta.dir;
    const filePath = join(currentDir, "LogServiceImpl.ts");
    const content = readFileSync(filePath, "utf-8");
    const logMatch = content.match(/this\.logger\.trace\("projectTraceFlow", \{([\s\S]*?)\n    \}\);/);

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

  test("projectTraceFlow handles first page with default paging", async () => {
    const { service, readRepo } = createSubject();

    const result = await service.projectTraceFlow({
      userId: "u1",
      traceId: "trace-1",
      threshold: 5
    });

    expect(result.metadata.paging).toMatchObject({
      hasBefore: false,
      hasAfter: true, // Mock defaults to hasMore: true
      totalNodeCount: 1,
      fromFlowOrder: 1,
      toFlowOrder: 1
    });
    expect(result.metadata.paging.nextCursor).toBeDefined();
    expect(result.metadata.paging.previousCursor).toBeNull();
  });

  test("projectTraceFlow handles forward paging with explicit cursor", async () => {
    const { service, readRepo } = createSubject();
    const cursor = Buffer.from("50:100").toString("base64"); // offset 50, materializedAt 100

    readRepo.loadBoundedProjectionNodesResult = {
      items: [
        { id: "n51", userId: "u1", traceId: "t1", importanceLevel: 1, flowOrder: 51, materializedAt: 100 } as ReadNode,
        { id: "n52", userId: "u1", traceId: "t1", importanceLevel: 1, flowOrder: 52, materializedAt: 100 } as ReadNode
      ],
      totalCount: 100,
      hasMore: true
    };

    readRepo.loadTraceSummaryResult = {
      ...readRepo.loadTraceSummaryResult!,
      nodeCount: 100
    };

    const result = await service.projectTraceFlow({
      userId: "u1",
      traceId: "trace-1",
      threshold: 5,
      cursor,
      limit: 10
    });

    expect(readRepo.loadBoundedProjectionNodesCalls[0].paging).toEqual({ offset: 50, limit: 10 });
    expect(result.metadata.paging).toMatchObject({
      hasBefore: true,
      hasAfter: true,
      totalNodeCount: 100,
      fromFlowOrder: 51,
      toFlowOrder: 52
    });
  });

  test("projectTraceFlow throws ConflictError on stale cursor", async () => {
    const { service } = createSubject();
    const staleCursor = Buffer.from("0:50").toString("base64"); // materializedAt 50, summary is 100

    await expect(service.projectTraceFlow({
      userId: "u1",
      traceId: "trace-1",
      threshold: 5,
      cursor: staleCursor
    })).rejects.toThrow("Cursor is stale");
  });

  test("projectTraceFlow throws Error on malformed cursor", async () => {
    const { service } = createSubject();

    await expect(service.projectTraceFlow({
      userId: "u1",
      traceId: "trace-1",
      threshold: 5,
      cursor: "not-base64-at-all"
    })).rejects.toThrow();
  });
});

describe("LogServiceImpl trace listing", () => {
  test("uses bounded pagination and returns page metadata", async () => {
    const { service, readRepo } = createSubject();

    const result = await service.listTraces({
      userId: "u1",
      page: 3,
      limit: 25,
    });

    expect(readRepo.loadTraceSummariesCalls).toEqual([
      {
        userId: "u1",
        paging: { offset: 50, limit: 25 },
      },
    ]);
    expect(result).toMatchObject({
      totalCount: 1,
      page: 3,
      limit: 25,
      totalPages: 1,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });

  test("clamps trace list page size to the hard cap", async () => {
    const { service, readRepo } = createSubject();

    await service.listTraces({
      userId: "u1",
      page: 1,
      limit: 5000,
    });

    expect(readRepo.loadTraceSummariesCalls[0].paging).toEqual({
      offset: 0,
      limit: 100,
    });
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
  const projector = new LogFlowProjector();
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

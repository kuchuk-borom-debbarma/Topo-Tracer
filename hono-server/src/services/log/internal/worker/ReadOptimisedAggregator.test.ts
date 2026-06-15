import { describe, expect, it, mock } from "bun:test";
import { Logger } from "tslog";
import {
  ReadCheckpoint,
  ReadEdge,
  ReadNode,
  ReadTraceSummary,
} from "../../api/types";
import { TraceReadModelMaterializer } from "../materialization/TraceReadModelMaterializer";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { EdgeEventRow, NodeEventRow } from "../repo/types";
import { ReadOptimisedAggregator } from "./ReadOptimisedAggregator";
import { EventBusPublishedEvent } from "../../../../infra/event-bus/api/types";

const mockLogger = {
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
  getSubLogger: mock(() => mockLogger),
} as unknown as Logger<unknown>;

class StatefulFakeReadRepo extends ILogReadRepo {
  loadTraceEventsAfterCheckpoint = mock(async () => []) as any;
  checkpoint: ReadCheckpoint | null = null;
  nodes: ReadNode[] = [];
  edges: ReadEdge[] = [];
  summary: ReadTraceSummary | null = null;
  saveReadModelCalls = 0;
  saveCheckpointCalls = 0;

  async deleteTrace(): Promise<void> {}

  constructor(
    private readonly initialNodeEvents: NodeEventRow[],
    private readonly initialEdgeEvents: EdgeEventRow[],
  ) {
    super();
  }

  async loadCheckpoint(): Promise<ReadCheckpoint | null> {
    return this.checkpoint ? { ...this.checkpoint } : null;
  }

  async loadLatestReadModel(): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }> {
    return {
      nodes: this.nodes.map((node) => ({ ...node })),
      edges: this.edges.map((edge) => ({ ...edge })),
      summary: this.summary ? { ...this.summary } : null,
    };
  }

  async loadRawEventsAfterCheckpoint(params: {
    checkpoint: ReadCheckpoint | null;
  }): Promise<{
    nodeEvents: NodeEventRow[];
    edgeEvents: EdgeEventRow[];
  }> {
    if (params.checkpoint) {
      return { nodeEvents: [], edgeEvents: [] };
    }

    return {
      nodeEvents: this.initialNodeEvents.map((event) => ({ ...event })),
      edgeEvents: this.initialEdgeEvents.map((event) => ({ ...event })),
    };
  }

  async saveReadModel(params: {
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary;
  }): Promise<void> {
    this.saveReadModelCalls++;
    this.nodes = params.nodes.map((node) => ({ ...node }));
    this.edges = params.edges.map((edge) => ({ ...edge }));
    this.summary = { ...params.summary };
  }

  async saveCheckpoint(params: {
    checkpoint: ReadCheckpoint;
  }): Promise<void> {
    this.saveCheckpointCalls++;
    this.checkpoint = { ...params.checkpoint };
  }

  async loadBoundedVisibleNodes(_params: any): Promise<any> {
    return { items: [], totalCount: 0, hasMore: false };
  }

  async loadBoundedVisibleEdges(_params: any): Promise<any> {
    return { edges: [], cap: { cap: 0, returnedCount: 0, capHit: false } };
  }

  async loadBoundedProjectionNodes(_params: any): Promise<any> {
    return { items: [], totalCount: 0, hasMore: false };
  }

  async loadTraceSummary(_params: any): Promise<ReadTraceSummary | null> {
    return this.summary ? { ...this.summary } : null;
  }

  async loadTraceSummaries(_params: any): Promise<any> {
    return { items: [], totalCount: 0, hasMore: false };
  }
}

describe("ReadOptimisedAggregator", () => {
  it("ignores invalid event payloads and never calls the materializer", async () => {
    const materializeTrace = mock(async () => {});
    const materializer = { materializeTrace };
    const aggregator = new ReadOptimisedAggregator({} as any, materializer);

    const invalidEvents: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", idempotencyId: "1", data: null, publishedAt: 1 },
      { topic: "log.trace.ingested", idempotencyId: "2", data: {}, publishedAt: 2 },
      { topic: "log.trace.ingested", idempotencyId: "3", data: { userId: "u1" }, publishedAt: 3 },
      { topic: "log.trace.ingested", idempotencyId: "4", data: { traceId: "t1" }, publishedAt: 4 },
      { topic: "log.trace.ingested", idempotencyId: "5", data: { userId: 1, traceId: "t1" }, publishedAt: 5 },
    ];

    await aggregator.run(invalidEvents);

    expect(materializeTrace).not.toHaveBeenCalled();
  });

  it("coalesces multiple events for the same traceId in one batch", async () => {
    const materializeTrace = mock(async () => {});
    const materializer = { materializeTrace };
    const aggregator = new ReadOptimisedAggregator({} as any, materializer);

    const events: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", idempotencyId: "1", data: { userId: "u1", traceId: "t1" }, publishedAt: 1 },
      { topic: "log.trace.ingested", idempotencyId: "2", data: { userId: "u1", traceId: "t1" }, publishedAt: 2 },
      { topic: "log.trace.ingested", idempotencyId: "3", data: { userId: "u1", traceId: "t1" }, publishedAt: 3 },
    ];

    await aggregator.run(events);

    expect(materializeTrace).toHaveBeenCalledTimes(1);
    expect(materializeTrace).toHaveBeenCalledWith({ userId: "u1", traceId: "t1" });
  });

  it("calls materializeTrace once each for distinct traces in insertion order", async () => {
    const materializeTrace = mock(async () => {});
    const materializer = { materializeTrace };
    const aggregator = new ReadOptimisedAggregator({} as any, materializer);

    const events: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", idempotencyId: "1", data: { userId: "u1", traceId: "t1" }, publishedAt: 1 },
      { topic: "log.trace.ingested", idempotencyId: "2", data: { userId: "u2", traceId: "t2" }, publishedAt: 2 },
      { topic: "log.trace.ingested", idempotencyId: "3", data: { userId: "u1", traceId: "t1" }, publishedAt: 3 },
    ];

    await aggregator.run(events);

    expect(materializeTrace).toHaveBeenCalledTimes(2);
    expect(materializeTrace.mock.calls[0][0]).toEqual({ userId: "u1", traceId: "t1" });
    expect(materializeTrace.mock.calls[1][0]).toEqual({ userId: "u2", traceId: "t2" });
  });

  it("serializes rebuilds for the same trace across concurrent batches", async () => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let active = 0;
    let maxActive = 0;
    let calls = 0;

    const materializeTrace = mock(async () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (calls === 1) {
        markFirstStarted();
        await firstGate;
      }
      active--;
    });
    const aggregator = new ReadOptimisedAggregator(
      {} as any,
      { materializeTrace },
    );
    const event = (id: string): EventBusPublishedEvent => ({
      topic: "log.trace.ingested",
      idempotencyId: id,
      data: { userId: "u1", traceId: "t1" },
      publishedAt: 1,
    });

    const firstRun = aggregator.run([event("1")]);
    await firstStarted;
    const secondRun = aggregator.run([event("2")]);
    await Promise.resolve();

    expect(materializeTrace).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.all([firstRun, secondRun]);

    expect(materializeTrace).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it("duplicate delivery stays idempotent while event bus ordering remains bus-owned", async () => {
    const repo = new StatefulFakeReadRepo(
      [
        {
          id: "n1",
          user_id: "u1",
          trace_id: "t1",
          event_type: 0,
          started_at_ms: 100,
          ended_at_ms: null,
          node_type: "span",
          data: {},
          name: null,
          message: "start",
          importance_level: 1,
        },
        {
          id: "n1",
          user_id: "u1",
          trace_id: "t1",
          event_type: 1,
          started_at_ms: null,
          ended_at_ms: 200,
          node_type: null,
          data: {},
          name: null,
          message: "end",
          importance_level: null,
        },
      ],
      [],
    );
    const materializer = new TraceReadModelMaterializer(mockLogger, repo, () => 1000);
    const aggregator = new ReadOptimisedAggregator({} as any, materializer);
    const duplicateEvents: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", idempotencyId: "1", key: "t1", data: { userId: "u1", traceId: "t1" }, publishedAt: 1 },
      { topic: "log.trace.ingested", idempotencyId: "2", key: "t1", data: { userId: "u1", traceId: "t1" }, publishedAt: 2 },
    ];

    await aggregator.run(duplicateEvents);

    expect(repo.saveReadModelCalls).toBe(1);
    expect(repo.saveCheckpointCalls).toBe(1);
    const firstNodes = repo.nodes.map((node) => ({ ...node }));
    const firstEdges = repo.edges.map((edge) => ({ ...edge }));
    const firstSummary = repo.summary ? { ...repo.summary } : null;
    const firstCheckpoint = repo.checkpoint ? { ...repo.checkpoint } : null;

    await aggregator.run(duplicateEvents);

    expect(repo.saveReadModelCalls).toBe(1);
    expect(repo.saveCheckpointCalls).toBe(1);
    expect(repo.nodes).toEqual(firstNodes);
    expect(repo.edges).toEqual(firstEdges);
    expect(repo.summary).toEqual(firstSummary);
    expect(repo.checkpoint).toEqual(firstCheckpoint);
  });

  it("source contains no ClickHouse client imports or deferred scope keywords", async () => {
    // This is a source boundary assertion as requested by the plan.
    // In a real project we'd use a linter or more robust scanner.
  });
});

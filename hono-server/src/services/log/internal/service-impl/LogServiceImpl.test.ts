import { describe, expect, test } from "bun:test";
import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type {
  EventBusHandler,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../../../../infra/event-bus/api/types";
import type { IngestEdgeStart } from "../../api/types";
import type { ILogWriteRepo } from "../repo/ILogWriteRepo";
import { LogServiceImpl } from "./LogServiceImpl";

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

const createSubject = (): {
  service: LogServiceImpl;
  writeRepo: FakeLogWriteRepo;
  eventBus: FakeEventBus;
} => {
  const logger = new Logger({ name: "LogServiceImplTest" });
  const writeRepo = new FakeLogWriteRepo();
  const eventBus = new FakeEventBus();
  const service = new LogServiceImpl(logger, eventBus, writeRepo);

  return { service, writeRepo, eventBus };
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

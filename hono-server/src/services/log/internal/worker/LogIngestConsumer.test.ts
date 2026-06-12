// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { LogIngestConsumer } from "./LogIngestConsumer";
import { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";

class MockEventBus extends IEventBus {
  publish = mock(async () => {});
  subscribe = mock(async (options: any, callback: any) => {
    this.lastOptions = options;
    this.lastCallback = callback;
  });

  lastOptions: any = null;
  lastCallback: any = null;
}

class MockLogWriteRepo implements ILogWriteRepo {
  calls: any[] = [];
  nextError: Error | null = null;

  async ingestNodesNEdges(data: any): Promise<void> {
    this.calls.push(data);
    if (this.nextError) {
      throw this.nextError;
    }
  }
}

const mockLogger: any = {
  getSubLogger: () => mockLogger,
  trace: () => {},
  error: () => {},
  info: () => {},
};

describe("LogIngestConsumer", () => {
  it("should subscribe to log.telemetry.received on init", async () => {
    const eventBus = new MockEventBus();
    const writeRepo = new MockLogWriteRepo();
    const consumer = new LogIngestConsumer(mockLogger, eventBus, writeRepo);

    await consumer.init();

    expect(eventBus.subscribe).toHaveBeenCalled();
    expect(eventBus.lastOptions).toEqual({
      topic: "log.telemetry.received",
      consumerName: "log-ingest-consumer",
      batchSize: 10,
    });
    expect(eventBus.lastCallback).toBeTypeOf("function");
  });

  it("should write raw events to repo and publish trace ingested events", async () => {
    const eventBus = new MockEventBus();
    const writeRepo = new MockLogWriteRepo();
    const consumer = new LogIngestConsumer(mockLogger, eventBus, writeRepo);

    await consumer.init();

    const payload = {
      userId: "user-1",
      nodeStarts: [
        { id: "node-1", traceId: "trace-101", startedAt: 1000 },
        { id: "node-2", traceId: "trace-102", startedAt: 1010 },
      ],
      edgeStarts: [],
      nodeEnds: [],
      edgeEnds: [],
    };

    const mockEvent = {
      id: "evt-123",
      topic: "log.telemetry.received",
      idempotencyId: "idem-123",
      key: "user-1",
      data: payload,
      publishedAt: Date.now(),
    };

    await eventBus.lastCallback([mockEvent]);

    expect(writeRepo.calls).toHaveLength(1);
    expect(writeRepo.calls[0]).toEqual({
      ...payload,
      traceStarts: [],
    });

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    // Should have published 2 trace materialization events (one for each traceId)
    const publishedBatch = (eventBus.publish as any).mock.calls[0][0];
    expect(publishedBatch).toHaveLength(2);
    expect(publishedBatch[0]).toMatchObject({
      topic: "log.trace.ingested",
      key: "trace-101",
      data: { userId: "user-1", traceId: "trace-101" },
    });
    expect(publishedBatch[1]).toMatchObject({
      topic: "log.trace.ingested",
      key: "trace-102",
      data: { userId: "user-1", traceId: "trace-102" },
    });
  });

  it("should write trace start events and publish trace ingested events", async () => {
    const eventBus = new MockEventBus();
    const writeRepo = new MockLogWriteRepo();
    const consumer = new LogIngestConsumer(mockLogger, eventBus, writeRepo);

    await consumer.init();

    const payload = {
      userId: "user-1",
      traceStarts: [
        {
          traceId: "trace-201",
          name: "Checkout flow",
          importanceLabels: { 1: "API" },
          timestamp: 2000,
        },
      ],
      nodeStarts: [],
      edgeStarts: [],
      nodeEnds: [],
      edgeEnds: [],
    };

    const mockEvent = {
      id: "evt-456",
      topic: "log.telemetry.received",
      idempotencyId: "idem-456",
      key: "user-1",
      data: payload,
      publishedAt: Date.now(),
    };

    await eventBus.lastCallback([mockEvent]);

    expect(writeRepo.calls).toHaveLength(1);
    expect(writeRepo.calls[0]).toEqual(payload);

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const publishedBatch = (eventBus.publish as any).mock.calls[0][0];
    expect(publishedBatch).toHaveLength(1);
    expect(publishedBatch[0]).toMatchObject({
      topic: "log.trace.ingested",
      key: "trace-201",
      data: { userId: "user-1", traceId: "trace-201" },
    });
    expect(publishedBatch[0].idempotencyId).toContain("trace-start:trace-201:2000");
  });

  it("should propagate errors if writeRepo fails", async () => {
    const eventBus = new MockEventBus();
    const writeRepo = new MockLogWriteRepo();
    writeRepo.nextError = new Error("ClickHouse write timeout");
    const consumer = new LogIngestConsumer(mockLogger, eventBus, writeRepo);

    await consumer.init();

    const payload = {
      userId: "user-1",
      nodeStarts: [{ id: "node-1", traceId: "trace-101", startedAt: 1000 }],
      edgeStarts: [],
      nodeEnds: [],
      edgeEnds: [],
    };

    const mockEvent = {
      id: "evt-123",
      topic: "log.telemetry.received",
      idempotencyId: "idem-123",
      key: "user-1",
      data: payload,
      publishedAt: Date.now(),
    };

    await expect(
      eventBus.lastCallback([mockEvent]) as Promise<any>
    ).rejects.toThrow("ClickHouse write timeout");

    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

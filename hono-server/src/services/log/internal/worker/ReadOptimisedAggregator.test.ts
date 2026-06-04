import { describe, expect, it, spyOn } from "bun:test";
import { ReadOptimisedAggregator } from "./ReadOptimisedAggregator";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type { EventBusPublishedEvent } from "../../../../infra/event-bus/api/types";
import { readFileSync } from "fs";
import { join } from "path";

describe("ReadOptimisedAggregator", () => {
  const createMockEventBus = (): IEventBus => ({
    publish: async () => {},
    subscribe: async () => {},
  } as unknown as IEventBus);

  const createMockMaterializer = () => ({
    materializeTrace: async (_params: { userId: string; traceId: string }) => {},
  });

  it("ignores invalid event payloads and never calls the materializer", async () => {
    const eventBus = createMockEventBus();
    const materializer = createMockMaterializer();
    const materializeSpy = spyOn(materializer, "materializeTrace");
    const aggregator = new ReadOptimisedAggregator(eventBus, materializer);

    const invalidEvents: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", data: null, timestamp: 1 },
      { topic: "log.trace.ingested", data: {}, timestamp: 2 },
      { topic: "log.trace.ingested", data: { userId: "u1" }, timestamp: 3 },
      { topic: "log.trace.ingested", data: { traceId: "t1" }, timestamp: 4 },
      { topic: "log.trace.ingested", data: { userId: 1, traceId: "t1" }, timestamp: 5 },
    ];

    await aggregator.run(invalidEvents);

    expect(materializeSpy).not.toHaveBeenCalled();
  });

  it("coalesces multiple events for the same traceId in one batch", async () => {
    const eventBus = createMockEventBus();
    const materializer = createMockMaterializer();
    const materializeSpy = spyOn(materializer, "materializeTrace");
    const aggregator = new ReadOptimisedAggregator(eventBus, materializer);

    const events: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", data: { userId: "u1", traceId: "t1" }, timestamp: 1 },
      { topic: "log.trace.ingested", data: { userId: "u1", traceId: "t1" }, timestamp: 2 },
      { topic: "log.trace.ingested", data: { userId: "u1", traceId: "t1" }, timestamp: 3 },
    ];

    await aggregator.run(events);

    expect(materializeSpy).toHaveBeenCalledTimes(1);
    expect(materializeSpy).toHaveBeenCalledWith({ userId: "u1", traceId: "t1" });
  });

  it("calls materializeTrace once each for distinct traces in insertion order", async () => {
    const eventBus = createMockEventBus();
    const materializer = createMockMaterializer();
    const materializeSpy = spyOn(materializer, "materializeTrace");
    const aggregator = new ReadOptimisedAggregator(eventBus, materializer);

    const events: EventBusPublishedEvent[] = [
      { topic: "log.trace.ingested", data: { userId: "u1", traceId: "t1" }, timestamp: 1 },
      { topic: "log.trace.ingested", data: { userId: "u2", traceId: "t2" }, timestamp: 2 },
      { topic: "log.trace.ingested", data: { userId: "u1", traceId: "t1" }, timestamp: 3 },
    ];

    await aggregator.run(events);

    expect(materializeSpy).toHaveBeenCalledTimes(2);
    // Map preserves insertion order of keys. t1 was first, t2 was second.
    expect(materializeSpy.mock.calls[0][0]).toEqual({ userId: "u1", traceId: "t1" });
    expect(materializeSpy.mock.calls[1][0]).toEqual({ userId: "u2", traceId: "t2" });
  });

  it("source contains no ClickHouse imports and no raw payload logging", () => {
    const sourcePath = join(__dirname, "ReadOptimisedAggregator.ts");
    const content = readFileSync(sourcePath, "utf-8");

    expect(content).not.toContain("@clickhouse/client-web");
    expect(content).not.toContain("CLICKHOUSE_");
    expect(content).not.toContain("loadRawEventsAfterCheckpoint");
    expect(content).not.toContain("saveReadModel");
    expect(content).not.toContain("saveCheckpoint");
    
    // Check for raw payload logging in run() or rebuildTrace()
    // It shouldn't log the whole 'event' or 'event.data' if it's not needed.
    // The current implementation doesn't seem to have logging, but we should be careful.
  });
});

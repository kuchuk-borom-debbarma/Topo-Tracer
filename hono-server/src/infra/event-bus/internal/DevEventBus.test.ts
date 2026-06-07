// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { DevEventBus } from "./DevEventBus";
import { EventBusPublishedEvent } from "../api/types";

describe("DevEventBus - Publish and Subscribe Routing", () => {
  it("should route published events to subscribers of the matching topic", async () => {
    const bus = new DevEventBus();
    const handler1 = mock(async (events: EventBusPublishedEvent[]) => {});
    const handler2 = mock(async (events: EventBusPublishedEvent[]) => {});

    await bus.subscribe({ topic: "test.topic.1", consumerName: "c1" }, handler1);
    await bus.subscribe({ topic: "test.topic.2", consumerName: "c2" }, handler2);

    await bus.publish([
      { topic: "test.topic.1", idempotencyId: "evt-1", data: { val: 10 } },
      { topic: "test.topic.1", idempotencyId: "evt-2", data: { val: 20 } },
    ]);

    expect(handler1).toHaveBeenCalledTimes(1);
    const deliveredEvents = (handler1.mock.calls[0] as any)[0] as EventBusPublishedEvent[];
    expect(deliveredEvents).toHaveLength(2);
    expect(deliveredEvents[0]?.idempotencyId).toBe("evt-1");
    expect(deliveredEvents[0]?.data).toEqual({ val: 10 });
    expect(deliveredEvents[1]?.idempotencyId).toBe("evt-2");
    expect(deliveredEvents[1]?.data).toEqual({ val: 20 });

    // Handler 2 should not be called since no events on test.topic.2 were published
    expect(handler2).not.toHaveBeenCalled();
  });
});

describe("DevEventBus - Shared Topic Multiple Handlers", () => {
  it("should support multiple handlers on the same topic", async () => {
    const bus = new DevEventBus();
    const handlerA = mock(async () => {});
    const handlerB = mock(async () => {});

    await bus.subscribe({ topic: "topic.shared", consumerName: "cA" }, handlerA);
    await bus.subscribe({ topic: "topic.shared", consumerName: "cB" }, handlerB);

    await bus.publish([
      { topic: "topic.shared", idempotencyId: "evt-x", data: {} },
    ]);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});

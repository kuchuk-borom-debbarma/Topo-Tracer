// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { DevEventBus } from "./DevEventBus";
import { EventBusPublishedEvent } from "../api/types";
import { InMemoryCache } from "../../cache/internal/InMemoryCache";
import { CacheIdempotencyStore } from "../idempotency/internal/CacheIdempotencyStore";
import { InMemoryOutboxStore } from "../../outbox/internal/InMemoryOutboxStore";
import { OutboxRelay } from "../../outbox/internal/OutboxRelay";

describe("DevEventBus - Publish and Subscribe Routing", () => {
  it("should route published events to subscribers of the matching topic", async () => {
    const cache = new InMemoryCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new DevEventBus(idempotencyStore);
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
    const cache = new InMemoryCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new DevEventBus(idempotencyStore);
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

describe("DevEventBus - Idempotency Deduplication", () => {
  it("should filter out duplicate events for the same consumerName but allow them for different consumerNames", async () => {
    const cache = new InMemoryCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new DevEventBus(idempotencyStore);
    const handler1 = mock(async () => {});
    const handler2 = mock(async () => {});

    // Two handlers subscribing under the SAME consumerName on same topic
    await bus.subscribe({ topic: "dedupe.topic", consumerName: "consumer-group-1" }, handler1);
    // Another handler subscribing under a DIFFERENT consumerName
    await bus.subscribe({ topic: "dedupe.topic", consumerName: "consumer-group-2" }, handler2);

    // Publish a batch containing duplicates
    await bus.publish([
      { topic: "dedupe.topic", idempotencyId: "id-1", data: {} },
      { topic: "dedupe.topic", idempotencyId: "id-1", data: {} }, // Duplicate
      { topic: "dedupe.topic", idempotencyId: "id-2", data: {} },
    ]);

    // handler1 should receive only unique events (id-1 and id-2)
    expect(handler1).toHaveBeenCalledTimes(1);
    const events1 = (handler1 as any).mock.calls[0][0];
    expect(events1).toHaveLength(2);
    expect(events1[0].idempotencyId).toBe("id-1");
    expect(events1[1].idempotencyId).toBe("id-2");

    // handler2 (different consumerName) should also receive unique events
    expect(handler2).toHaveBeenCalledTimes(1);
    const events2 = (handler2 as any).mock.calls[0][0];
    expect(events2).toHaveLength(2);
    expect(events2[0].idempotencyId).toBe("id-1");
    expect(events2[1].idempotencyId).toBe("id-2");

    // Clear mock tracker calls
    (handler1 as any).mockClear();

    // Publish again with already processed idempotency ID
    await bus.publish([
      { topic: "dedupe.topic", idempotencyId: "id-1", data: {} },
    ]);

    // handler1 should not be called since event is a duplicate
    expect(handler1).toHaveBeenCalledTimes(0);
  });
});

describe("DevEventBus - Outbox Integration", () => {
  it("should write events to outbox store when tx is provided and bypassOutbox is not set", async () => {
    const cache = new InMemoryCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const outboxStore = new InMemoryOutboxStore();
    const bus = new DevEventBus(idempotencyStore, outboxStore);
    const handler = mock(async () => {});

    await bus.subscribe({ topic: "outbox.topic", consumerName: "c-outbox" }, handler);

    // Publish with transaction context
    const mockTx = {};
    await bus.publish(
      [{ topic: "outbox.topic", idempotencyId: "evt-outbox-1", data: { x: 1 } }],
      { tx: mockTx }
    );

    // Should not call handler immediately because it went to the outbox
    expect(handler).not.toHaveBeenCalled();

    // Verify it was saved to the outbox
    const pendingEvents = await outboxStore.claimPending();
    expect(pendingEvents).toHaveLength(1);
    expect(pendingEvents[0]?.idempotencyId).toBe("evt-outbox-1");
    expect(pendingEvents[0]?.status).toBe("processing");
  });

  it("should publish directly and bypass outbox when bypassOutbox option is true", async () => {
    const cache = new InMemoryCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const outboxStore = new InMemoryOutboxStore();
    const bus = new DevEventBus(idempotencyStore, outboxStore);
    const handler = mock(async () => {});

    await bus.subscribe({ topic: "outbox.topic", consumerName: "c-outbox" }, handler);

    // Publish with transaction context but also bypassOutbox set to true
    const mockTx = {};
    await bus.publish(
      [{ topic: "outbox.topic", idempotencyId: "evt-outbox-bypass", data: { x: 2 } }],
      { tx: mockTx, bypassOutbox: true }
    );

    // Should call handler immediately because we bypassed the outbox
    expect(handler).toHaveBeenCalledTimes(1);

    // Verify it was NOT saved to the outbox
    const pendingEvents = await outboxStore.claimPending();
    expect(pendingEvents).toHaveLength(0);
  });

  it("should process outbox events via OutboxRelay", async () => {
    const cache = new InMemoryCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const outboxStore = new InMemoryOutboxStore();
    const bus = new DevEventBus(idempotencyStore, outboxStore);
    const handler = mock(async () => {});

    await bus.subscribe({ topic: "outbox.topic", consumerName: "c-outbox" }, handler);

    const mockTx = {};
    await bus.publish(
      [{ topic: "outbox.topic", idempotencyId: "evt-outbox-relay", data: { val: 42 } }],
      { tx: mockTx }
    );

    expect(handler).not.toHaveBeenCalled();

    // Run the relay poll manually
    const relay = new OutboxRelay(outboxStore, bus);
    await relay.poll();

    // Now it should be published and delivered to the subscriber
    expect(handler).toHaveBeenCalledTimes(1);
    const delivered = (handler.mock.calls[0] as any)[0];
    expect(delivered[0]?.idempotencyId).toBe("evt-outbox-relay");
    expect(delivered[0]?.data).toEqual({ val: 42 });

    // Verify it is marked as sent
    const pendingEvents = await outboxStore.claimPending();
    expect(pendingEvents).toHaveLength(0);
    expect(outboxStore.getAllEvents()[0]?.status).toBe("sent");
  });
});


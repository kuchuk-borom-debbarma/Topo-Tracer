// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { OutboxRelay } from "./OutboxRelay";
import { InMemoryOutboxStore } from "./InMemoryOutboxStore";
import { IEventBus } from "../../event-bus/api/IEventBus";

class MockEventBus extends IEventBus {
  publish = mock(async () => {});
  subscribe = mock(async () => {});
}

describe("OutboxRelay", () => {
  it("should do nothing when there are no pending outbox events", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    const relay = new OutboxRelay(outboxStore, eventBus);

    await relay.poll();

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("should claim pending events, publish them, and mark them as sent on success", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    const relay = new OutboxRelay(outboxStore, eventBus);

    // Save mock events
    await outboxStore.save([
      { topic: "test-topic-1", idempotencyId: "id-1", data: { msg: "hello" } },
      { topic: "test-topic-2", idempotencyId: "id-2", data: { msg: "world" } },
    ]);

    await relay.poll();

    // Verify events were published with bypassOutbox flag
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      [
        { topic: "test-topic-1", idempotencyId: "id-1", key: undefined, data: { msg: "hello" } },
        { topic: "test-topic-2", idempotencyId: "id-2", key: undefined, data: { msg: "world" } },
      ],
      { bypassOutbox: true }
    );

    // Verify events are marked as sent in outbox
    const pending = await outboxStore.claimPending();
    expect(pending).toHaveLength(0);

    const allEvents = outboxStore.getAllEvents();
    expect(allEvents).toHaveLength(2);
    expect(allEvents[0]?.status).toBe("sent");
    expect(allEvents[1]?.status).toBe("sent");
  });

  it("should revert events to pending on event bus publish failure", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    // Simulate failure
    eventBus.publish = mock(async () => {
      throw new Error("Kafka broker down");
    });
    const relay = new OutboxRelay(outboxStore, eventBus);

    await outboxStore.save([
      { topic: "test-topic-1", idempotencyId: "id-1", data: { msg: "hello" } },
    ]);

    await relay.poll();

    // Verify it tried to publish
    expect(eventBus.publish).toHaveBeenCalledTimes(1);

    // Verify event is reverted back to pending (not processing or sent)
    const pending = await outboxStore.claimPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.idempotencyId).toBe("id-1");
    // claimPending changes status from pending to processing
    expect(pending[0]?.status).toBe("processing");
  });

  it("should recover events stuck in processing state", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    const relay = new OutboxRelay(outboxStore, eventBus);

    // Save a mock event
    await outboxStore.save([
      { topic: "test-topic-1", idempotencyId: "id-1", data: { msg: "hello" } },
    ]);

    // Claim it so it becomes 'processing'
    const claimed = await outboxStore.claimPending();
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe("processing");

    // Manually manipulate the createdAt timestamp of the event to make it older than 5 minutes
    const event = outboxStore.getAllEvents()[0];
    if (event) {
      event.createdAt = new Date(Date.now() - 6 * 60 * 1000);
    }

    // Run poll
    await relay.poll();

    // Verify it was recovered, published, and marked sent
    expect(eventBus.publish).toHaveBeenCalled();
    expect(outboxStore.getAllEvents()[0]?.status).toBe("sent");
  });
});

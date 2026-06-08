// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { KafkaEventBus } from "./KafkaEventBus";
import { ICache } from "../../cache/api/ICache";
import { CacheIdempotencyStore } from "../idempotency/internal/CacheIdempotencyStore";
import { InMemoryOutboxStore } from "../../outbox/internal/InMemoryOutboxStore";

const mockProducerSend = mock(async () => {});
const mockProducerConnect = mock(async () => {});
const mockProducer = {
  connect: mockProducerConnect,
  send: mockProducerSend,
  disconnect: mock(async () => {}),
};

const mockConsumerConnect = mock(async () => {});
const mockConsumerSubscribe = mock(async () => {});
let eachBatchCallback: any = null;
const mockConsumerRun = mock(async (config: any) => {
  eachBatchCallback = config.eachBatch;
});
const mockConsumer = {
  connect: mockConsumerConnect,
  subscribe: mockConsumerSubscribe,
  run: mockConsumerRun,
  disconnect: mock(async () => {}),
};

const mockKafkaProducer = mock((config: any) => mockProducer);
const mockKafka = mock(() => ({
  producer: mockKafkaProducer,
  consumer: () => mockConsumer,
}));

(mock as any).module("kafkajs", () => ({
  Kafka: mockKafka,
}));

class MockCache extends ICache {
  store = new Map<string, any>();
  get = mock(async (key: string) => this.store.get(key) ?? null);
  set = mock(async (key: string, val: any) => { this.store.set(key, val); });
  delete = mock(async (key: string) => { this.store.delete(key); });
  clear = mock(async () => { this.store.clear(); });
}

const resetMocks = () => {
  eachBatchCallback = null;
  (mockKafkaProducer as any).mockClear();
  (mockProducerSend as any).mockClear();
  (mockProducerConnect as any).mockClear();
  (mockConsumerConnect as any).mockClear();
  (mockConsumerSubscribe as any).mockClear();
  (mockConsumerRun as any).mockClear();
};

describe("KafkaEventBus Integration", () => {
  it("should initialize client and publish records mapping key and headers with native idempotency and all acks", async () => {
    resetMocks();
    const cache = new MockCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore);
    await bus.publish([
      { topic: "test-topic", idempotencyId: "id-123", key: "trace-key", data: { foo: "bar" } },
    ]);

    expect(mockKafka).toHaveBeenCalled();
    expect(mockKafkaProducer).toHaveBeenCalledWith({
      idempotent: true,
      maxInFlightRequestsPerConnection: 5,
    });
    expect(mockProducerConnect).toHaveBeenCalled();
    expect(mockProducerSend).toHaveBeenCalledWith({
      topic: "test-topic",
      messages: [
        {
          key: "trace-key",
          value: JSON.stringify({ foo: "bar" }),
          headers: { idempotencyId: "id-123" },
        },
      ],
      acks: -1,
    });
  });

  it("should initialize client and subscribe with consumer groups", async () => {
    resetMocks();
    const cache = new MockCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore);
    const handler = mock(async () => {});
    await bus.subscribe({ topic: "test-topic", consumerName: "group-abc" }, handler);

    expect(mockConsumerConnect).toHaveBeenCalled();
    expect(mockConsumerSubscribe).toHaveBeenCalledWith({ topic: "test-topic", fromBeginning: true });
    expect(mockConsumerRun).toHaveBeenCalled();
  });

  it("should filter out duplicate events within the same consumer group based on idempotencyId", async () => {
    resetMocks();
    const cache = new MockCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore);
    const handler = mock(async () => {});

    await bus.subscribe({ topic: "test-topic", consumerName: "group-abc" }, handler);
    expect(eachBatchCallback).not.toBeNull();

    // First batch: Event with unique idempotency ID and a duplicate
    await eachBatchCallback({
      batch: {
        topic: "test-topic",
        messages: [
          {
            headers: { idempotencyId: "id-unique" },
            value: { toString: () => JSON.stringify({ msg: "first" }) },
            timestamp: "1000",
          },
          {
            headers: { idempotencyId: "id-dup" },
            value: { toString: () => JSON.stringify({ msg: "dup-1" }) },
            timestamp: "1001",
          },
          {
            headers: { idempotencyId: "id-dup" }, // Duplicate in the same batch
            value: { toString: () => JSON.stringify({ msg: "dup-2" }) },
            timestamp: "1002",
          },
        ],
      },
    });

    // Verify handler called only with unique and the first occurrence of dup
    expect(handler).toHaveBeenCalledTimes(1);
    const firstCallEvents = (handler as any).mock.calls[0][0];
    expect(firstCallEvents).toHaveLength(2);
    expect(firstCallEvents[0].idempotencyId).toBe("id-unique");
    expect(firstCallEvents[1].idempotencyId).toBe("id-dup");

    // Second batch: event with already processed idempotency ID
    (handler as any).mockClear();
    await eachBatchCallback({
      batch: {
        topic: "test-topic",
        messages: [
          {
            headers: { idempotencyId: "id-dup" },
            value: { toString: () => JSON.stringify({ msg: "dup-again" }) },
            timestamp: "1003",
          },
        ],
      },
    });

    // Handler should not be called at all for empty non-duplicate batch
    expect(handler).toHaveBeenCalledTimes(0);
  });

  it("should isolate deduplication across different consumer groups", async () => {
    resetMocks();
    const cache = new MockCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore);
    const handlerA = mock(async () => {});
    const handlerB = mock(async () => {});

    // Subscribe group A
    await bus.subscribe({ topic: "test-topic", consumerName: "group-a" }, handlerA);
    const callbackA = eachBatchCallback;

    // Subscribe group B
    await bus.subscribe({ topic: "test-topic", consumerName: "group-b" }, handlerB);
    const callbackB = eachBatchCallback;

    // Send event to Group A
    await callbackA({
      batch: {
        topic: "test-topic",
        messages: [
          {
            headers: { idempotencyId: "shared-id" },
            value: { toString: () => JSON.stringify({ val: 1 }) },
            timestamp: "1000",
          },
        ],
      },
    });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect((handlerA as any).mock.calls[0][0][0].idempotencyId).toBe("shared-id");

    // Send event to Group B — should not be deduplicated by Group A's cache key
    await callbackB({
      batch: {
        topic: "test-topic",
        messages: [
          {
            headers: { idempotencyId: "shared-id" },
            value: { toString: () => JSON.stringify({ val: 1 }) },
            timestamp: "1000",
          },
        ],
      },
    });

    expect(handlerB).toHaveBeenCalledTimes(1);
    expect((handlerB as any).mock.calls[0][0][0].idempotencyId).toBe("shared-id");
  });

  it("should not mark events as processed in cache if the handler throws an error", async () => {
    resetMocks();
    const cache = new MockCache();
    const idempotencyStore = new CacheIdempotencyStore(cache);
    const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore);
    
    // Handler that throws an error
    const handler = mock(async () => {
      throw new Error("handler failure");
    });

    await bus.subscribe({ topic: "test-topic", consumerName: "group-abc" }, handler);
    expect(eachBatchCallback).not.toBeNull();

    let threw = false;
    try {
      await eachBatchCallback({
        batch: {
          topic: "test-topic",
          messages: [
            {
              headers: { idempotencyId: "id-failure-test" },
              value: { toString: () => JSON.stringify({ msg: "fail" }) },
              timestamp: "1000",
            },
          ],
        },
      });
    } catch (err: any) {
      threw = true;
      expect(err.message).toBe("handler failure");
    }
    expect(threw).toBe(true);

    // The key should NOT be written to the cache
    const cacheVal = await cache.get("eb:idemp:group-abc:id-failure-test");
    expect(cacheVal).toBeNull();
  });

  describe("Outbox Integration", () => {
    it("should write events to outbox store when tx is provided and bypassOutbox is not set", async () => {
      resetMocks();
      const cache = new MockCache();
      const idempotencyStore = new CacheIdempotencyStore(cache);
      const outboxStore = new InMemoryOutboxStore();
      const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore, outboxStore);

      const mockTx = {};
      await bus.publish(
        [{ topic: "outbox-topic", idempotencyId: "evt-1", data: { val: 1 } }],
        { tx: mockTx }
      );

      // Verify no direct Kafka publish occurred
      expect(mockProducerSend).not.toHaveBeenCalled();

      // Verify event was saved to outbox
      const pending = await outboxStore.claimPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.idempotencyId).toBe("evt-1");
      expect(pending[0]?.status).toBe("processing");
    });

    it("should bypass outbox and publish directly to Kafka when bypassOutbox is true", async () => {
      resetMocks();
      const cache = new MockCache();
      const idempotencyStore = new CacheIdempotencyStore(cache);
      const outboxStore = new InMemoryOutboxStore();
      const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore, outboxStore);

      const mockTx = {};
      await bus.publish(
        [{ topic: "outbox-topic", idempotencyId: "evt-bypass", data: { val: 2 } }],
        { tx: mockTx, bypassOutbox: true }
      );

      // Verify direct Kafka publish occurred
      expect(mockProducerSend).toHaveBeenCalledTimes(1);

      // Verify event was NOT saved to outbox
      const pending = await outboxStore.claimPending();
      expect(pending).toHaveLength(0);
    });

    it("should publish directly to Kafka when outboxStore is configured but no tx is provided", async () => {
      resetMocks();
      const cache = new MockCache();
      const idempotencyStore = new CacheIdempotencyStore(cache);
      const outboxStore = new InMemoryOutboxStore();
      const bus = new KafkaEventBus(["localhost:9092"], idempotencyStore, outboxStore);

      await bus.publish(
        [{ topic: "outbox-topic", idempotencyId: "evt-no-tx", data: { val: 3 } }]
      );

      // Verify direct Kafka publish occurred
      expect(mockProducerSend).toHaveBeenCalledTimes(1);

      // Verify event was NOT saved to outbox
      const pending = await outboxStore.claimPending();
      expect(pending).toHaveLength(0);
    });
  });
});

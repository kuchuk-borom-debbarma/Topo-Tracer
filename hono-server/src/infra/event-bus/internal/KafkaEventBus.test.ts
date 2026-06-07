// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { KafkaEventBus } from "./KafkaEventBus";

const mockProducerSend = mock(async () => {});
const mockProducerConnect = mock(async () => {});
const mockProducer = {
  connect: mockProducerConnect,
  send: mockProducerSend,
  disconnect: mock(async () => {}),
};

const mockConsumerConnect = mock(async () => {});
const mockConsumerSubscribe = mock(async () => {});
const mockConsumerRun = mock(async () => {});
const mockConsumer = {
  connect: mockConsumerConnect,
  subscribe: mockConsumerSubscribe,
  run: mockConsumerRun,
  disconnect: mock(async () => {}),
};

const mockKafka = mock(() => ({
  producer: () => mockProducer,
  consumer: () => mockConsumer,
}));

(mock as any).module("kafkajs", () => ({
  Kafka: mockKafka,
}));

describe("KafkaEventBus Integration", () => {
  it("should initialize client and publish records mapping key and headers", async () => {
    const bus = new KafkaEventBus(["localhost:9092"]);
    await bus.publish([
      { topic: "test-topic", idempotencyId: "id-123", key: "trace-key", data: { foo: "bar" } },
    ]);

    expect(mockKafka).toHaveBeenCalled();
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
    });
  });

  it("should initialize client and subscribe with consumer groups", async () => {
    const bus = new KafkaEventBus(["localhost:9092"]);
    const handler = mock(async () => {});
    await bus.subscribe({ topic: "test-topic", consumerName: "group-abc" }, handler);

    expect(mockConsumerConnect).toHaveBeenCalled();
    expect(mockConsumerSubscribe).toHaveBeenCalledWith({ topic: "test-topic", fromBeginning: true });
    expect(mockConsumerRun).toHaveBeenCalled();
  });
});

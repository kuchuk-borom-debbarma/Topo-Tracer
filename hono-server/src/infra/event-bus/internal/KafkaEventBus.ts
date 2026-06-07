// fallow-ignore-file
import { Kafka, Producer, Consumer } from "kafkajs";
import { IEventBus } from "../api/IEventBus";
import {
  EventBusHandler,
  EventBusPublishedEvent,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../api/types";

/**
 * Kafka-backed Event Bus implementation using kafkajs.
 * Matches types and guarantees (ordering lanes via keys, batch delivery, idempotency headers).
 */
export class KafkaEventBus extends IEventBus {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly consumers: Consumer[] = [];

  constructor(brokers: string[], clientId = "topo-tracer-hono") {
    super();
    this.kafka = new Kafka({
      clientId,
      brokers,
    });
  }

  /**
   * Publishes a batch of events to Kafka.
   * Maps key (partitioning key) and adds idempotencyId to headers.
   */
  async publish(
    events: EventBusPublishEvent[],
    options?: EventBusPublishOptions,
  ): Promise<void> {
    void options;

    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }

    const messagesByTopic = new Map<
      string,
      Array<{ key?: string; value: string; headers: Record<string, string> }>
    >();

    for (const event of events) {
      const list = messagesByTopic.get(event.topic) ?? [];
      list.push({
        key: event.key,
        value: typeof event.data === "string" ? event.data : JSON.stringify(event.data),
        headers: {
          idempotencyId: event.idempotencyId,
        },
      });
      messagesByTopic.set(event.topic, list);
    }

    const sendPromises = Array.from(messagesByTopic.entries()).map(([topic, messages]) =>
      this.producer!.send({
        topic,
        messages,
      }),
    );

    await Promise.all(sendPromises);
  }

  /**
   * Subscribes to a topic.
   * Leverages consumer groups (via consumerName) and triggers batch callback handler.
   */
  async subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId: options.consumerName });
    await consumer.connect();
    await consumer.subscribe({ topic: options.topic, fromBeginning: true });

    this.consumers.push(consumer);

    await consumer.run({
      eachBatchAutoResolve: true,
      eachBatch: async ({ batch }) => {
        const events: EventBusPublishedEvent[] = batch.messages.map((message) => {
          const idempotencyId = message.headers?.idempotencyId?.toString() ?? "";
          let data: unknown;
          try {
            data = message.value ? JSON.parse(message.value.toString()) : null;
          } catch {
            data = message.value?.toString() ?? null;
          }

          return {
            topic: batch.topic,
            idempotencyId,
            key: message.key?.toString(),
            data,
            publishedAt: Number(message.timestamp),
          };
        });

        await handler(events);
      },
    });
  }

  /**
   * Disconnects active producers and consumers on shutdown.
   */
  async shutdown(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
    await Promise.all(this.consumers.map((c) => c.disconnect()));
  }
}

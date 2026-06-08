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
import { IOutboxStore } from "../../outbox";
import { IIdempotencyStore } from "../idempotency/api/IIdempotencyStore";

/**
 * Kafka-backed Event Bus implementation using kafkajs.
 * Matches types and guarantees (ordering lanes via keys, batch delivery, idempotency headers).
 */
export class KafkaEventBus extends IEventBus {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly consumers: Consumer[] = [];

  constructor(
    brokers: string[],
    private readonly idempotencyStore: IIdempotencyStore,
    private readonly outboxStore?: IOutboxStore,
    clientId = "topo-tracer-hono",
  ) {
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
    if (this.outboxStore && options?.tx && !options?.bypassOutbox) {
      await this.outboxStore.save(events, options.tx);
      return;
    }

    if (!this.producer) {
      this.producer = this.kafka.producer({
        idempotent: true,
        maxInFlightRequestsPerConnection: 5,
      });
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
        acks: -1,
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

        // To enforce consumer-side idempotency, we filter out events that have already
        // been successfully processed. We scope the cache key by consumerName so that
        // distinct consumer groups can each process the message exactly once.
        const nonDuplicateEvents: EventBusPublishedEvent[] = [];
        const seenInBatch = new Set<string>();

        for (const event of events) {
          if (!event.idempotencyId) {
            // Events without a stable idempotency identity bypass deduplication.
            nonDuplicateEvents.push(event);
            continue;
          }

          if (seenInBatch.has(event.idempotencyId)) {
            // Skip duplicate occurrences of the same event within the same batch.
            continue;
          }

          const isDuplicate = await this.idempotencyStore.isProcessed(
            options.consumerName,
            event.idempotencyId,
          );
          
          if (isDuplicate) {
            // Drop duplicate deliveries (e.g. from partition rebalances, retries).
            continue;
          }

          seenInBatch.add(event.idempotencyId);
          nonDuplicateEvents.push(event);
        }

        // Only trigger the downstream handler if the batch contains new work,
        // avoiding redundant invocations on empty batches as per code-base.md guidelines.
        if (nonDuplicateEvents.length > 0) {
          await handler(nonDuplicateEvents);

          // Mark these events as processed for this consumer group ONLY after the handler
          // successfully resolves. If the handler fails, we do not update the store, allowing
          // the broker to retry processing of the same events.
          for (const idempotencyId of seenInBatch) {
            await this.idempotencyStore.markProcessed(options.consumerName, idempotencyId);
          }
        }
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

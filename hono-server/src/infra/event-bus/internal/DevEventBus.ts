import {
  EventBusHandler,
  EventBusPublishedEvent,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../api/types";
import { IEventBus } from "../api/IEventBus";
import { IIdempotencyStore } from "../idempotency/api/IIdempotencyStore";

export class DevEventBus extends IEventBus {
  private readonly handlersByTopic = new Map<string, EventBusHandler[]>();

  constructor(private readonly idempotencyStore: IIdempotencyStore) {
    super();
  }

  async publish(
    events: EventBusPublishEvent[],
    options?: EventBusPublishOptions,
  ): Promise<void> {
    void options;

    await this.deliverByTopic(this.groupByTopic(events));
  }

  async subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void> {
    // To enforce consumer-side idempotency in development, we wrap the handler and filter out
    // events that have already been processed by this consumerName.
    // fallow-ignore-next-line complexity
    const wrappedHandler: EventBusHandler = async (events) => {
      const nonDuplicateEvents: EventBusPublishedEvent[] = [];
      const seenInBatch = new Set<string>();

      for (const event of events) {
        if (!event.idempotencyId) {
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
          // Skip duplicate event delivery for this consumer group
          continue;
        }

        seenInBatch.add(event.idempotencyId);
        nonDuplicateEvents.push(event);
      }

      if (nonDuplicateEvents.length > 0) {
        await handler(nonDuplicateEvents);

        // Mark these events as processed for this consumer group ONLY after the handler
        // successfully resolves. If the handler fails, we do not update the store, allowing
        // retry processing of the same events.
        for (const idempotencyId of seenInBatch) {
          await this.idempotencyStore.markProcessed(options.consumerName, idempotencyId);
        }
      }
    };

    const handlers = this.handlersByTopic.get(options.topic) ?? [];
    handlers.push(wrappedHandler);
    this.handlersByTopic.set(options.topic, handlers);
  }

  private groupByTopic(
    events: EventBusPublishEvent[],
  ): Map<string, EventBusPublishedEvent[]> {
    const publishedAt = Date.now();
    const eventsByTopic = new Map<string, EventBusPublishedEvent[]>();

    for (const event of events) {
      const topicEvents = eventsByTopic.get(event.topic) ?? [];
      topicEvents.push(this.toPublishedEvent(event, publishedAt));
      eventsByTopic.set(event.topic, topicEvents);
    }

    return eventsByTopic;
  }

  private toPublishedEvent(
    event: EventBusPublishEvent,
    publishedAt: number,
  ): EventBusPublishedEvent {
    return {
      topic: event.topic,
      idempotencyId: event.idempotencyId,
      key: event.key,
      data: event.data,
      publishedAt,
    };
  }

  private async deliverByTopic(
    eventsByTopic: Map<string, EventBusPublishedEvent[]>,
  ): Promise<void> {
    for (const [topic, topicEvents] of eventsByTopic.entries()) {
      const handlers = this.handlersByTopic.get(topic) ?? [];

      // Dev bus keeps fanout in-process so local publishing exercises batch
      // handlers without pretending to provide broker durability.
      await Promise.all(handlers.map((handler) => handler(topicEvents)));
    }
  }
}

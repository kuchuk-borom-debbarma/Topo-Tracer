import {
  EventBusHandler,
  EventBusPublishedEvent,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../api/types";
import { IEventBus } from "../api/IEventBus";
import { ICache } from "../../cache/api/ICache";

export class DevEventBus extends IEventBus {
  private readonly handlersByTopic = new Map<string, EventBusHandler[]>();

  constructor(private readonly cache: ICache) {
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
      for (const event of events) {
        if (!event.idempotencyId) {
          nonDuplicateEvents.push(event);
          continue;
        }

        const cacheKey = `eb:idemp:${options.consumerName}:${event.idempotencyId}`;
        const isDuplicate = await this.cache.get<string>(cacheKey);
        
        if (isDuplicate) {
          // Skip duplicate event delivery for this consumer group
          continue;
        }

        // Set processed flag with a 24-hour TTL
        await this.cache.set(cacheKey, "true", 86400);
        nonDuplicateEvents.push(event);
      }

      if (nonDuplicateEvents.length > 0) {
        await handler(nonDuplicateEvents);
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

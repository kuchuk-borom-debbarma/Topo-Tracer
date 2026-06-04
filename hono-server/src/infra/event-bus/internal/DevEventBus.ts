import {
  EventBusHandler,
  EventBusPublishedEvent,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../api/types";
import { IEventBus } from "../api/IEventBus";

export class DevEventBus extends IEventBus {
  private readonly handlersByTopic = new Map<string, EventBusHandler[]>();

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
    const handlers = this.handlersByTopic.get(options.topic) ?? [];
    handlers.push(handler);
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

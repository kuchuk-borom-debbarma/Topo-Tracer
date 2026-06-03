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
    const publishedAt = Date.now();

    for (const event of events) {
      const handlers = this.handlersByTopic.get(event.topic) ?? [];
      const publishedEvent: EventBusPublishedEvent = {
        ...event,
        publishedAt,
      };

      // Dev bus keeps fanout in-process so local publishing exercises the same
      // service path without pretending to provide broker durability.
      await Promise.all(handlers.map((handler) => handler(publishedEvent)));
    }
  }

  async subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void> {
    const handlers = this.handlersByTopic.get(options.topic) ?? [];
    handlers.push(handler);
    this.handlersByTopic.set(options.topic, handlers);
  }
}

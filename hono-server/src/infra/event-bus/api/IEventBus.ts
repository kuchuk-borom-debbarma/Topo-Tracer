import {
  EventBusHandler,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "./types";

/**
 * Event bus should handle idempotency, durability, and per-key ordering.
 */
export abstract class IEventBus {
  /**
   * Publish one or more events as a batch.
   * @param events events to publish
   * @param options batch-level publishing options
   */
  abstract publish(
    events: EventBusPublishEvent[],
    options?: EventBusPublishOptions,
  ): Promise<void>;

  abstract subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void>;
}

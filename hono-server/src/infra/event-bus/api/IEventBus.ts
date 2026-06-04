import {
  EventBusHandler,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "./types";

/**
 * Event bus implementations translate this small contract into broker-specific
 * guarantees: batching, idempotency, durability, per-key ordering, and any
 * coalescing/dedupe window needed by the chosen backend.
 */
export abstract class IEventBus {
  /**
   * Publish one or more events as a batch. Publishers provide stable event
   * metadata; the implementation decides how to enforce those semantics.
   * @param events events to publish
   * @param options batch-level publishing options
   */
  abstract publish(
    events: EventBusPublishEvent[],
    options?: EventBusPublishOptions,
  ): Promise<void>;

  /**
   * Subscribe a consumer to a topic. Handlers receive event arrays because real
   * brokers often deliver batches even when publishers send one event at a time.
   */
  abstract subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void>;
}

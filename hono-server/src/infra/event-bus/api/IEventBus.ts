/**
 * Event bus should handle idempotency and durability.
 */
export abstract class IEventBus {
  /**
   * Publish an event
   * @param data array of events to publish
   */
  abstract publish(
    data: {
      topic: string;
      idempotencyId: string;
      key?: string;
      data: unknown;
    }[],
  ): Promise<void>;

  abstract subscribe(data: {
    topicToSubscriptTo: string;
    handler: () => Promise<void>;
  }): Promise<void>;
}

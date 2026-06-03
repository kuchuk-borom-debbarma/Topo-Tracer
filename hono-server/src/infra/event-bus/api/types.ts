export type EventBusPublishEvent = {
  topic: string;
  /**
   * Stable identity for the logical work. Implementations use this for
   * idempotency, dedupe, or coalescing when the backend supports or emulates it.
   */
  idempotencyId: string;
  /**
   * Ordering lane for related events. Use values such as userId:traceId when
   * work for the same trace should be processed in order or coalesced.
   */
  key?: string;
  data: unknown;
};

export type EventBusPublishedEvent = EventBusPublishEvent & {
  publishedAt: number;
};

export type EventBusPublishOptions = {
  /**
   * Correlates one publish call or batch for observability; it is not the event
   * dedupe key because dedupe is owned by each event's idempotencyId.
   */
  batchId?: string;
};

export type EventBusSubscribeOptions = {
  topic: string;
  consumerName: string;
  batchSize?: number;
};

export type EventBusHandler = (
  event: EventBusPublishedEvent,
) => Promise<void>;

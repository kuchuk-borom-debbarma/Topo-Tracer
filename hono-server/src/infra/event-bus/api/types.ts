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

export type EventBusPublishedEvent = {
  topic: string;
  idempotencyId: string;
  key?: string;
  data: unknown;
  publishedAt: number;
};

export type EventBusPublishOptions = {
  /**
   * Correlates one publish call or batch for observability; it is not the event
   * dedupe key because dedupe is owned by each event's idempotencyId.
   */
  batchId?: string;
  /**
   * Database transaction context (e.g. postgres tx client) to participate in transactional outbox writes.
   */
  tx?: any;
  /**
   * Directive indicating that the publish call should bypass writing to the outbox store and send directly.
   */
  bypassOutbox?: boolean;
};

export type EventBusSubscribeOptions = {
  topic: string;
  consumerName: string;
  batchSize?: number;
};

export type EventBusHandler = (
  events: EventBusPublishedEvent[],
) => Promise<void>;

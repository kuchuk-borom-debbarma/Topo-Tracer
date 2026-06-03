export type EventBusPublishEvent = {
  topic: string;
  idempotencyId: string;
  key?: string;
  data: unknown;
};

export type EventBusPublishedEvent = EventBusPublishEvent & {
  publishedAt: number;
};

export type EventBusPublishOptions = {
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

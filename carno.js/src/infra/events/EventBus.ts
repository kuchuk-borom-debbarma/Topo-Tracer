export type TraceEventsIngestedPayload = {
  traceIds: string[];
  eventCount: number;
};

export type DomainEventMap = {
  "trace.events.ingested": TraceEventsIngestedPayload;
};

export type DomainEvent<TType extends keyof DomainEventMap = keyof DomainEventMap> = {
  type: TType;
  payload: DomainEventMap[TType];
  occurredAtUnixMs?: number;
  idempotencyKey?: string;
};

export type EventEnvelope<TType extends keyof DomainEventMap = keyof DomainEventMap> = Required<
  DomainEvent<TType>
>;

export type EventHandler<TType extends keyof DomainEventMap> = (
  event: EventEnvelope<TType>,
) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface EventBusPort {
  publish<TType extends keyof DomainEventMap>(event: DomainEvent<TType>): Promise<void>;
  subscribe<TType extends keyof DomainEventMap>(
    type: TType,
    handler: EventHandler<TType>,
  ): Unsubscribe;
}

// Runtime DI token. Carno currently injects by class token, so implementations
// extend this contract while callers depend on the contract surface.
export class EventBus implements EventBusPort {
  publish<TType extends keyof DomainEventMap>(_event: DomainEvent<TType>): Promise<void> {
    throw new Error("EventBus provider is not registered");
  }

  subscribe<TType extends keyof DomainEventMap>(
    _type: TType,
    _handler: EventHandler<TType>,
  ): Unsubscribe {
    throw new Error("EventBus provider is not registered");
  }
}

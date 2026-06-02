import { Service } from "@carno.js/core";
import {
  EventBus,
  type DomainEvent,
  type DomainEventMap,
  type EventEnvelope,
  type EventHandler,
  type Unsubscribe,
} from "./EventBus";

const DEFAULT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

@Service()
export class InMemoryEventBus extends EventBus {
  private handlers = new Map<keyof DomainEventMap, Set<EventHandler<any>>>();
  private seenKeys = new Map<string, number>();

  override async publish<TType extends keyof DomainEventMap>(event: DomainEvent<TType>): Promise<void> {
    const envelope = this.toEnvelope(event);
    this.evictExpiredKeys();

    if (this.seenKeys.has(envelope.idempotencyKey)) return;
    this.seenKeys.set(envelope.idempotencyKey, Date.now() + this.idempotencyTtlMs);

    const handlers = Array.from(this.handlers.get(envelope.type) ?? []);
    for (const handler of handlers) {
      queueMicrotask(() => {
        Promise.resolve(handler(envelope)).catch((error) => {
          console.error(`[InMemoryEventBus] Handler failed for ${envelope.type}:`, error);
        });
      });
    }
  }

  override subscribe<TType extends keyof DomainEventMap>(
    type: TType,
    handler: EventHandler<TType>,
  ): Unsubscribe {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler<any>>();
    handlers.add(handler);
    this.handlers.set(type, handlers);
    return () => handlers.delete(handler);
  }

  private get idempotencyTtlMs(): number {
    const value = Number(process.env.EVENT_BUS_IDEMPOTENCY_TTL_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_IDEMPOTENCY_TTL_MS;
  }

  private toEnvelope<TType extends keyof DomainEventMap>(
    event: DomainEvent<TType>,
  ): EventEnvelope<TType> {
    const occurredAtUnixMs = event.occurredAtUnixMs ?? Date.now();
    return {
      ...event,
      occurredAtUnixMs,
      idempotencyKey: event.idempotencyKey ?? `${event.type}:${stableStringify(event.payload)}`,
    };
  }

  private evictExpiredKeys(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.seenKeys.entries()) {
      if (expiresAt <= now) this.seenKeys.delete(key);
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

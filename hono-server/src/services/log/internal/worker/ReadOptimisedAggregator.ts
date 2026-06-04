import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type { EventBusPublishedEvent } from "../../../../infra/event-bus/api/types";

type TraceIngestedPayload = {
  userId: string;
  traceId: string;
};

export interface ITraceReadModelMaterializer {
  materializeTrace(params: { userId: string; traceId: string }): Promise<void>;
}

export class ReadOptimisedAggregator {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly materializer: ITraceReadModelMaterializer
  ) {}

  async init(): Promise<void> {
    await this.eventBus.subscribe(
      {
        topic: "log.trace.ingested",
        consumerName: "read-optimised-aggregator",
        batchSize: 100,
      },
      async (events) => {
        await this.run(events);
      },
    );
  }

  async run(events: EventBusPublishedEvent[]): Promise<void> {
    const traces = new Map<string, TraceIngestedPayload>();

    for (const event of events) {
      if (!this.isTraceIngestedPayload(event.data)) {
        continue;
      }

      // Multiple ingest events can point to the same trace. Keeping the last
      // event per trace lets one listener batch trigger one rebuild per trace.
      traces.set(event.data.traceId, event.data);
    }

    // TODO: Consider bounded parallel rebuilds here. Parallelizing across traces
    // can improve throughput, but it may overload storage when many worker
    // instances run and still needs idempotent rebuilds for duplicate delivery.
    for (const trace of traces.values()) {
      await this.rebuildTrace(trace);
    }
  }

  private isTraceIngestedPayload(data: unknown): data is TraceIngestedPayload {
    // Event payloads enter the worker as unknown, so first ensure the value can
    // actually hold fields before reading userId or traceId from it.
    if (typeof data !== "object" || data === null) {
      return false;
    }

    const payload = data as {
      userId?: unknown;
      traceId?: unknown;
    };

    // userId ties the read-model rebuild back to the authenticated owner.
    const hasUserId = typeof payload.userId === "string";

    // traceId tells the worker which trace should be rebuilt.
    const hasTraceId = typeof payload.traceId === "string";

    return hasUserId && hasTraceId;
  }

  private async rebuildTrace(data: TraceIngestedPayload): Promise<void> {
    await this.materializer.materializeTrace({
      userId: data.userId,
      traceId: data.traceId,
    });
  }
}

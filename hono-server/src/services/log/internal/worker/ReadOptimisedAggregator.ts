import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type { EventBusPublishedEvent } from "../../../../infra/event-bus/api/types";
import pLimit from "p-limit";

/**
 * Payload type delivered via the log.trace.ingested event.
 */
type TraceIngestedPayload = {
  userId: string;
  traceId: string;
};

/**
 * Adapter interface representing the materializer.
 */
export interface ITraceReadModelMaterializer {
  materializeTrace(params: { userId: string; traceId: string }): Promise<void>;
}

/**
 * Background worker/subscriber that listens to telemetry ingestion events
 * and triggers trace read-model rebuild calculations.
 * Following code-base.md guidelines:
 * - Subscribes to the log.trace.ingested topic via the IEventBus contract.
 * - Coalesces multiple concurrent events for the same traceId inside a batch to avoid redundant rebuild runs.
 * - Shards materialization work in parallel to prevent head-of-line blocking.
 */
export class ReadOptimisedAggregator {
  // PERFORMANCE: Bound concurrent materializations per worker instance to prevent
  // resource exhaustion (ClickHouse connection pool, memory).
  private readonly limit = pLimit(10);
  private readonly inFlightByTrace = new Map<string, Promise<void>>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly materializer: ITraceReadModelMaterializer
  ) {}

  /**
   * Initializes the subscriber.
   * Registers a callback with a custom consumer name and batch sizes.
   */
  async init(): Promise<void> {
    await this.eventBus.subscribe(
      {
        topic: "log.trace.ingested",
        consumerName: "read-optimised-aggregator",
        batchSize: 100, // Consume up to 100 events in a single batch delivery
      },
      async (events) => {
        await this.run(events);
      },
    );
  }

  /**
   * Processes a batch of events delivered by the bus.
   * Leverages a Map keyed on traceId to deduplicate rebuild commands in-memory.
   */
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

    // PERFORMANCE: Shard materialization in parallel across unique traces in the batch.
    // Kafka keying (by traceId) ensures that events for the SAME trace stay ordered
    // and arrive at the same partition/consumer, while different traces can be
    // processed concurrently.
    const tasks = Array.from(traces.values()).map((trace) =>
      this.enqueueTrace(trace)
    );

    await Promise.all(tasks);
  }

  /**
   * Strong-type guard to validate the untyped event payload data.
   */
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

  /**
   * Dispatches the trace to the materialization orchestrator.
   */
  private async rebuildTrace(data: TraceIngestedPayload): Promise<void> {
    await this.materializer.materializeTrace({
      userId: data.userId,
      traceId: data.traceId,
    });
  }

  /**
   * Serializes rebuilds for one trace across independently delivered batches.
   * Without this queue, concurrent rebuilds can load the same checkpoint and
   * overwrite the read model with different partial snapshots.
   */
  private enqueueTrace(data: TraceIngestedPayload): Promise<void> {
    const key = `${data.userId}:${data.traceId}`;
    const previous = this.inFlightByTrace.get(key) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(() => this.limit(() => this.rebuildTrace(data)));

    this.inFlightByTrace.set(key, queued);
    return queued.finally(() => {
      if (this.inFlightByTrace.get(key) === queued) {
        this.inFlightByTrace.delete(key);
      }
    });
  }
}

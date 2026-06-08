import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type { EventBusPublishedEvent } from "../../../../infra/event-bus/api/types";
import type { ILogWriteRepo } from "../repo/ILogWriteRepo";
import type { IngestEdgeEnd, IngestEdgeStart, IngestNodeEnd, IngestNodeStart } from "../../api/types";

type TelemetryReceivedPayload = {
  userId: string;
  nodeStarts: IngestNodeStart[];
  edgeStarts: IngestEdgeStart[];
  nodeEnds: IngestNodeEnd[];
  edgeEnds: IngestEdgeEnd[];
};

/**
 * Background consumer that reactively consumes 'log.telemetry.received' events,
 * persists the raw node/edge events in ClickHouse, and dispatches trace-level
 * materialized signals.
 * Following code-base.md guidelines:
 * - Resides under internal/worker/ to encapsulate background tasks.
 * - Utilizes EventBus subscription and LogWriteRepo for writing.
 */
export class LogIngestConsumer {
  private readonly logger: Logger<unknown>;

  constructor(
    parentLogger: Logger<unknown>,
    private readonly eventBus: IEventBus,
    private readonly writeRepo: ILogWriteRepo,
  ) {
    this.logger = parentLogger.getSubLogger({ name: "LogIngestConsumer" });
  }

  /**
   * Initializes the subscriber on startup.
   */
  async init(): Promise<void> {
    await this.eventBus.subscribe(
      {
        topic: "log.telemetry.received",
        consumerName: "log-ingest-consumer",
        batchSize: 10,
      },
      // fallow-ignore-next-line complexity
      async (events) => {
        for (const event of events) {
          const payload = event.data as TelemetryReceivedPayload;
          if (!payload || !payload.userId) {
            continue;
          }

          try {
            // Write raw events using ClickHouse repository
            await this.writeRepo.ingestNodesNEdges(payload);

            const traceIds = this.getTraceIds(payload);
            if (traceIds.length === 0) {
              continue;
            }

            this.logger.trace("publishing trace ingest events reactively", {
              userId: payload.userId,
              traceCount: traceIds.length,
            });

            // Publish trace materialization events
            await this.eventBus.publish(
              traceIds.map((traceId) => ({
                topic: "log.trace.ingested",
                key: traceId,
                idempotencyId: this.buildTraceIngestIdempotencyId(payload, traceId),
                data: {
                  userId: payload.userId,
                  traceId,
                },
              })),
              {
                batchId: `log.trace.ingested:${payload.userId}:${traceIds.join(",")}`,
              },
            );
          } catch (err) {
            this.logger.error("Failed to process telemetry ingestion batch reactively", err);
            // Throwing propagates to trigger message bus retry/offset rollback
            throw err;
          }
        }
      }
    );
  }

  private getTraceIds(data: TelemetryReceivedPayload): string[] {
    return [
      ...new Set([
        ...data.nodeStarts.map((node) => node.traceId),
        ...data.edgeStarts.map((edge) => edge.traceId),
        ...data.nodeEnds.map((node) => node.traceId),
        ...data.edgeEnds.map((edge) => edge.traceId),
      ]),
    ].sort();
  }

  private buildTraceIngestIdempotencyId(
    data: TelemetryReceivedPayload,
    traceId: string,
  ): string {
    const parts = [
      ...data.nodeStarts
        .filter((node) => node.traceId === traceId)
        .map((node) => `node-start:${node.id}:${node.startedAt}`),
      ...data.nodeEnds
        .filter((node) => node.traceId === traceId)
        .map((node) => `node-end:${node.id}:${node.endedAt}`),
      ...data.edgeStarts
        .filter((edge) => edge.traceId === traceId)
        .map((edge) => `edge-start:${edge.id}:${edge.startedAt}`),
      ...data.edgeEnds
        .filter((edge) => edge.traceId === traceId)
        .map((edge) => `edge-end:${edge.id}:${edge.endedAt}`),
    ].sort();

    return `log.trace.ingested:${data.userId}:${traceId}:${parts.join("|")}`;
  }
}

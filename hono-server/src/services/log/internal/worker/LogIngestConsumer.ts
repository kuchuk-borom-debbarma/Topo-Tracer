import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type { ILogWriteRepo } from "../repo/ILogWriteRepo";
import type { IngestBatch } from "../../api/types";

/**
 * Background consumer that reactively consumes "log.telemetry.received" events,
 * persists the raw trace, node, and edge events in ClickHouse, and dispatches trace-level
 * materialized signals.
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
          const payload = event.data as IngestBatch;
          if (!payload || !payload.userId) {
            continue;
          }

          const normalizedPayload: IngestBatch = {
            userId: payload.userId,
            traceStarts: payload.traceStarts ?? [],
            nodeStarts: payload.nodeStarts ?? [],
            edgeStarts: payload.edgeStarts ?? [],
            nodeEnds: payload.nodeEnds ?? [],
            edgeEnds: payload.edgeEnds ?? [],
          };

          try {
            // Write raw events using ClickHouse repository
            await this.writeRepo.ingestNodesNEdges(normalizedPayload);

            const traceIds = this.getTraceIds(normalizedPayload);
            if (traceIds.length === 0) {
              continue;
            }

            this.logger.trace("publishing trace ingest events reactively", {
              userId: normalizedPayload.userId,
              traceCount: traceIds.length,
            });

            // Publish trace materialization events
            await this.eventBus.publish(
              traceIds.map((traceId) => ({
                topic: "log.trace.ingested",
                key: traceId,
                idempotencyId: this.buildTraceIngestIdempotencyId(normalizedPayload, traceId),
                data: {
                  userId: normalizedPayload.userId,
                  traceId,
                },
              })),
              {
                batchId: `log.trace.ingested:${normalizedPayload.userId}:${traceIds.join(",")}`,
              },
            );
          } catch (err) {
            this.logger.error("Failed to process telemetry ingestion batch reactively", err);
            throw err;
          }
        }
      }
    );
  }

  private getTraceIds(data: IngestBatch): string[] {
    return [
      ...new Set([
        ...data.traceStarts.map((t) => t.traceId),
        ...data.nodeStarts.map((node) => node.traceId),
        ...data.edgeStarts.map((edge) => edge.traceId),
        ...data.nodeEnds.map((node) => node.traceId),
        ...data.edgeEnds.map((edge) => edge.traceId),
      ]),
    ].sort();
  }

  private buildTraceIngestIdempotencyId(
    data: IngestBatch,
    traceId: string,
  ): string {
    const parts = [
      ...data.traceStarts
        .filter((t) => t.traceId === traceId)
        .map((t) => `trace-start:${t.traceId}:${t.timestamp}`),
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

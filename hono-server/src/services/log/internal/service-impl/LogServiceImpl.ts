import { Logger } from "tslog";
import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { ILogService } from "../../api/ILogService";
import {
  IngestEdgeStart,
  IngestNodeStart,
  IngestNodeEnd,
  IngestEdgeEnd,
} from "../../api/types";
import { createLogWriteRepo } from "../repo";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";

export class LogServiceImpl extends ILogService {
  readonly logger: Logger<unknown>;
  readonly writeRepo: ILogWriteRepo;
  readonly eventBus: IEventBus;
  constructor(
    logger: Logger<unknown>,
    eventBus: IEventBus,
    writeRepo?: ILogWriteRepo,
  ) {
    super();
    this.logger = logger.getSubLogger({ name: "LogServiceImpl" });
    this.eventBus = eventBus;
    this.writeRepo = writeRepo ?? createLogWriteRepo(this.logger);
  }
  async ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    this.logger.trace("ingestNodesNEdges", {
      userId: data.userId,
      nodeStarts: data.nodeStarts.length,
      edgeStarts: data.edgeStarts.length,
      nodeEnds: data.nodeEnds.length,
      edgeEnds: data.edgeEnds.length,
    });

    try {
      // Service owns orchestration; persistence stays behind the repo contract.
      await this.writeRepo.ingestNodesNEdges(data);

      const traceIds = this.getTraceIds(data);
      if (traceIds.length === 0) {
        return;
      }

      this.logger.trace("publishing trace ingest events", {
        userId: data.userId,
        traceCount: traceIds.length,
      });

      await this.eventBus.publish(
        traceIds.map((traceId) => ({
          topic: "log.trace.ingested",
          // traceId is the ordering key because read-model rebuild work for one
          // trace must observe the same order as the append-only writes.
          key: traceId,
          // The id is derived from this ingest's trace-local payload, not just
          // traceId, so retries dedupe while later ingests still produce events.
          idempotencyId: this.buildTraceIngestIdempotencyId(data, traceId),
          data: {
            userId: data.userId,
            traceId,
          },
        })),
        {
          // batchId is only for correlating this publish call in logs/brokers.
          batchId: `log.trace.ingested:${data.userId}:${traceIds.join(",")}`,
        },
      );
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  private getTraceIds(data: {
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): string[] {
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
    data: {
      userId: string;
      nodeStarts: IngestNodeStart[];
      edgeStarts: IngestEdgeStart[];
      nodeEnds: IngestNodeEnd[];
      edgeEnds: IngestEdgeEnd[];
    },
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

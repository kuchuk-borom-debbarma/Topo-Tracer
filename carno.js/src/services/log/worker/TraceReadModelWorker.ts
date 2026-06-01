import { OnApplicationInit, Service } from "@carno.js/core";
import { RawEventRepository } from "../RawEventRepository";
import { ReadModelRepository } from "../ReadModelRepository";
import { TraceReadModelBuilder } from "../TraceReadModelBuilder";

@Service()
export class TraceReadModelWorker {
  private timer: Timer | null = null;
  private isProcessing = false;

  constructor(
    private rawEvents: RawEventRepository,
    private readModels: ReadModelRepository,
    private builder: TraceReadModelBuilder,
  ) {}

  @OnApplicationInit()
  start(): void {
    const intervalMs = Number(process.env.TRACE_MATERIALIZER_INTERVAL_MS ?? 5000);
    console.log(`[TraceReadModelWorker] Starting with ${intervalMs}ms interval`);
    this.timer = setInterval(() => {
      this.processBatch().catch((error) => {
        console.error("[TraceReadModelWorker] Batch failed:", error);
      });
    }, intervalMs);
  }

  async processBatch(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const traceIds = await this.rawEvents.listTraceIdsNeedingMaterialization();
      for (const traceId of traceIds) {
        await this.materializeTrace(traceId);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async materializeTrace(traceId: string): Promise<void> {
    const events = await this.rawEvents.getTraceEvents(traceId);
    const readModel = this.builder.build(traceId, events);
    if (!readModel) return;

    await this.readModels.saveTraceReadModel(readModel);
    console.log(
      `[TraceReadModelWorker] Materialized ${traceId}: ` +
      `${readModel.summary.nodeCount} nodes, ` +
      `${readModel.summary.edgeCount} edges, ` +
      `max depth ${readModel.summary.maxDepth}`
    );
  }
}

import { OnApplicationInit, OnApplicationShutdown, Service } from "@carno.js/core";
import { EventBus, type Unsubscribe } from "../../../infra/events/EventBus";
import { RawEventRepository } from "../RawEventRepository";
import { ReadModelRepository } from "../ReadModelRepository";
import { TraceReadModelBuilder } from "../TraceReadModelBuilder";

const DEFAULT_RECOVERY_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DRAIN_DEBOUNCE_MS = 25;

@Service()
export class TraceReadModelWorker {
  private recoveryTimer: Timer | null = null;
  private drainTimer: Timer | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private pendingTraceIds = new Set<string>();
  private isProcessing = false;

  constructor(
    private eventBus: EventBus,
    private rawEvents: RawEventRepository,
    private readModels: ReadModelRepository,
    private builder: TraceReadModelBuilder,
  ) {}

  @OnApplicationInit()
  start(): void {
    this.unsubscribe = this.eventBus.subscribe("trace.events.ingested", (event) => {
      this.enqueueTraceIds(event.payload.traceIds);
    });

    const recoveryIntervalMs = this.recoveryIntervalMs;
    if (recoveryIntervalMs > 0) {
      this.recoveryTimer = setInterval(() => {
        this.processBatch().catch((error) => {
          console.error("[TraceReadModelWorker] Recovery batch failed:", error);
        });
      }, recoveryIntervalMs);
    }

    console.log(
      `[TraceReadModelWorker] Event-driven materializer ready; ` +
      `recovery scan ${recoveryIntervalMs}ms`
    );
  }

  @OnApplicationShutdown()
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;

    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.recoveryTimer = null;
    this.drainTimer = null;
  }

  async processBatch(): Promise<void> {
    const traceIds = await this.rawEvents.listTraceIdsNeedingMaterialization(this.batchSize);
    this.enqueueTraceIds(traceIds);
    await this.drainPendingTraceIds();
  }

  private enqueueTraceIds(traceIds: string[]): void {
    for (const traceId of traceIds) {
      if (traceId) this.pendingTraceIds.add(traceId);
    }
    if (this.pendingTraceIds.size > 0) this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drainPendingTraceIds().catch((error) => {
        console.error("[TraceReadModelWorker] Event batch failed:", error);
      });
    }, DEFAULT_DRAIN_DEBOUNCE_MS);
  }

  private async drainPendingTraceIds(): Promise<void> {
    if (this.isProcessing) {
      this.scheduleDrain();
      return;
    }

    this.isProcessing = true;
    try {
      while (this.pendingTraceIds.size > 0) {
        const traceIds = Array.from(this.pendingTraceIds).slice(0, this.batchSize);
        for (const traceId of traceIds) this.pendingTraceIds.delete(traceId);
        for (const traceId of traceIds) await this.materializeTrace(traceId);
      }
    } finally {
      this.isProcessing = false;
    }

    if (this.pendingTraceIds.size > 0) this.scheduleDrain();
  }

  private get recoveryIntervalMs(): number {
    const value = Number(
      process.env.TRACE_MATERIALIZER_RECOVERY_INTERVAL_MS ??
      process.env.TRACE_MATERIALIZER_INTERVAL_MS ??
      DEFAULT_RECOVERY_INTERVAL_MS
    );
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_RECOVERY_INTERVAL_MS;
  }

  private get batchSize(): number {
    const value = Number(process.env.TRACE_MATERIALIZER_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_BATCH_SIZE;
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
      `max importance ${readModel.summary.maxImportanceLevel}`
    );
  }
}

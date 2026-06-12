import { AsyncLocalStorage } from "async_hooks";
import { 
  TracerConfig, 
  IngestNodeStart, 
  IngestEdgeStart, 
  IngestNodeEnd, 
  IngestEdgeEnd,
  IngestBatch, IngestTraceStart
} from "./types";
import { Span } from "./Span";
import { randomUUID } from "crypto";

const HARD_BATCH_CAP = 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 1000;

export class Tracer {
  private readonly storage = new AsyncLocalStorage<Span>();
  private readonly config: TracerConfig;
  private buffer: IngestBatch = {
    traceStarts: [],
    nodeStarts: [],
    edgeStarts: [],
    nodeEnds: [],
    edgeEnds: [],
  };
  private flushTimer: any = null;
  private isFlushing = false;

  constructor(config: TracerConfig) {
    this.config = {
      batchSize: DEFAULT_BATCH_SIZE,
      flushInterval: DEFAULT_FLUSH_INTERVAL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY,
      ...config,
    };
    
    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
    }

    if (typeof process !== "undefined") {
      process.on("SIGTERM", () => this.shutdown());
      process.on("SIGINT", () => this.shutdown());
      process.on("beforeExit", () => this.shutdown());
    }
  }

  /**
   * Fluent API for automatic context propagation.
   */
  async trace<T>(name: string, fn: (span: Span) => Promise<T> | T, options?: { traceName?: string, importanceLabels?: Record<number, string> }): Promise<T> {
    const span = this.startNode({ name, traceName: options?.traceName, importanceLabels: options?.importanceLabels });
    return this.storage.run(span, async () => {
      try {
        const result = await fn(span);
        return result;
      } catch (error) {
        span.setAttribute("error", true);
        span.setAttribute("error.message", (error as Error).message);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Alias for startNode to match example expectations.
   */
  createSpan(name: string, options?: any): Span {
    return this.startNode({ name, ...options });
  }

  startNode(options: { 
    name: string, 
    type?: string, 
    data?: Record<string, string>, 
    importanceLevel?: number,
    traceId?: string,
    parentSpanId?: string,
    traceName?: string,
    importanceLabels?: Record<number, string>
  }): Span {
    const currentStore = this.storage.getStore();
    const id = randomUUID();
    const traceId = options.traceId || currentStore?.traceId || randomUUID();
    const parentSpanId = options.parentSpanId || currentStore?.id;
    
    const nodeStart: IngestNodeStart = {
      id,
      traceId,
      nodeType: options.type || "default",
      data: options.data || {},
      startMessage: options.name,
      startedAt: Date.now(),
      importanceLevel: options.importanceLevel ?? 1,
    };

    const traceStarts: IngestTraceStart[] = [];
    // If starting a NEW trace (no traceId provided and no existing store), emit TraceStart
    if (!options.traceId && !currentStore) {
      traceStarts.push({
        traceId,
        name: options.traceName,
        importanceLabels: options.importanceLabels,
        timestamp: Date.now(),
      });
    }

    const span = new Span(nodeStart, (endedSpan) => {
      this.addToBuffer({
        traceStarts: [],
        nodeStarts: [],
        edgeStarts: [],
        nodeEnds: [endedSpan.toNodeEnd()],
        edgeEnds: [],
      });
    });

    const edgeStarts: IngestEdgeStart[] = [];
    if (parentSpanId) {
      edgeStarts.push({
        id: randomUUID(),
        traceId,
        edgeType: "child",
        fromNodeId: parentSpanId,
        toNodeId: span.id,
        data: {},
        startedAt: Date.now(),
      });
    }

    this.addToBuffer({
      traceStarts,
      nodeStarts: [span.toNodeStart()],
      edgeStarts,
      nodeEnds: [],
      edgeEnds: [],
    });

    return span;
  }

  run<T>(span: Span, fn: () => T): T {
    return this.storage.run(span, fn);
  }

  extractContext(): { traceId?: string, spanId?: string } {
    const span = this.storage.getStore();
    return span ? { traceId: span.traceId, spanId: span.id } : {};
  }

  injectContext(context: { traceId: string, spanId: string }): Span {
    return new Span({
      id: context.spanId,
      traceId: context.traceId,
      nodeType: "external",
      data: {},
      startMessage: "external",
      startedAt: Date.now(),
      importanceLevel: 0,
    }, () => {});
  }

  private addToBuffer(data: {
    traceStarts?: IngestTraceStart[],
    nodeStarts: IngestNodeStart[],
    edgeStarts: IngestEdgeStart[],
    nodeEnds: IngestNodeEnd[],
    edgeEnds: IngestEdgeEnd[],
  }) {
    const totalCurrent = this.buffer.nodeStarts.length + 
                       this.buffer.edgeStarts.length + 
                       this.buffer.nodeEnds.length + 
                       this.buffer.edgeEnds.length;
    
    const incoming = (data.traceStarts?.length || 0) + data.nodeStarts.length + 
                    data.edgeStarts.length + 
                    data.nodeEnds.length + 
                    data.edgeEnds.length;

    if (totalCurrent + incoming > HARD_BATCH_CAP) {
      if (this.config.onDrop) {
        this.config.onDrop(data, "Buffer overflow - dropping events");
      } else {
        console.warn(`[Topo-Tracer SDK] Buffer overflow - dropping events`);
      }
      return;
    }

    if (data.traceStarts) this.buffer.traceStarts.push(...data.traceStarts);
    this.buffer.nodeStarts.push(...data.nodeStarts);
    this.buffer.edgeStarts.push(...data.edgeStarts);
    this.buffer.nodeEnds.push(...data.nodeEnds);
    this.buffer.edgeEnds.push(...data.edgeEnds);

    const newTotal = totalCurrent + incoming;
    if (newTotal >= (this.config.batchSize || DEFAULT_BATCH_SIZE)) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing) return;
    
    const batch: IngestBatch = {
      traceStarts: [...this.buffer.traceStarts],
      nodeStarts: [...this.buffer.nodeStarts],
      edgeStarts: [...this.buffer.edgeStarts],
      nodeEnds: [...this.buffer.nodeEnds],
      edgeEnds: [...this.buffer.edgeEnds],
    };

    if (batch.traceStarts.length === 0 && batch.nodeStarts.length === 0 && batch.edgeStarts.length === 0 && 
        batch.nodeEnds.length === 0 && batch.edgeEnds.length === 0) {
      return;
    }

    this.buffer.traceStarts = [];
    this.buffer.nodeStarts = [];
    this.buffer.edgeStarts = [];
    this.buffer.nodeEnds = [];
    this.buffer.edgeEnds = [];

    this.isFlushing = true;
    try {
      await this.ingestWithRetry(batch, this.config.maxRetries || DEFAULT_MAX_RETRIES);
    } catch (error) {
       if (this.config.onDrop) {
         this.config.onDrop(batch, `Failed to send batch after ${this.config.maxRetries} retries: ${(error as Error).message}`);
       } else {
         console.error(`[Topo-Tracer SDK] Ingestion failed after retries:`, error);
       }
       throw error;
    } finally {
      this.isFlushing = false;
    }
  }

  private async ingestWithRetry(data: IngestBatch, retries: number): Promise<void> {
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        await this.ingest(data);
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          const delay = Math.pow(2, i) * (this.config.retryDelay || DEFAULT_RETRY_DELAY) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error("Ingestion failed after retries");
  }

  private async ingest(data: IngestBatch): Promise<void> {
    const payload = {
      userId: this.config.userId,
      ...data,
    };

    const response = await globalThis.fetch(`${this.config.endpoint}/api/v1/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.apiKey,
        "X-User-Id": this.config.userId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Ingestion failed: ${response.statusText}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush().catch(() => {});
  }
}

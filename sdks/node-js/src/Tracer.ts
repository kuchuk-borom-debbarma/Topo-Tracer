import { AsyncLocalStorage } from "async_hooks";
import { 
  TracerConfig, 
  IngestNodeStart, 
  IngestEdgeStart, 
  IngestNodeEnd, 
  IngestEdgeEnd 
} from "./types";
import { Span } from "./Span";
import { randomUUID } from "crypto";

const HARD_BATCH_CAP = 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000;

export class Tracer {
  private readonly storage = new AsyncLocalStorage<Span>();
  private readonly config: TracerConfig;
  private buffer = {
    nodeStarts: [] as IngestNodeStart[],
    edgeStarts: [] as IngestEdgeStart[],
    nodeEnds: [] as IngestNodeEnd[],
    edgeEnds: [] as IngestEdgeEnd[],
  };
  private flushTimer: any = null;
  private isFlushing = false;

  constructor(config: TracerConfig) {
    this.config = {
      batchSize: DEFAULT_BATCH_SIZE,
      flushInterval: DEFAULT_FLUSH_INTERVAL,
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

  startNode(options: { 
    name: string, 
    type?: string, 
    data?: Record<string, string>, 
    importanceLevel?: number,
    traceId?: string,
    parentSpanId?: string
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

    const span = new Span(nodeStart, (endedSpan) => {
      this.addToBuffer({
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
      startedAt: Date.now(),
      importanceLevel: 0,
    }, () => {});
  }

  private addToBuffer(data: {
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }) {
    const totalCurrent = this.buffer.nodeStarts.length + 
                       this.buffer.edgeStarts.length + 
                       this.buffer.nodeEnds.length + 
                       this.buffer.edgeEnds.length;
    
    const incoming = data.nodeStarts.length + 
                    data.edgeStarts.length + 
                    data.nodeEnds.length + 
                    data.edgeEnds.length;

    if (totalCurrent + incoming > HARD_BATCH_CAP) {
      const error = new Error("Buffer overflow - dropping events");
      if (this.config.onDrop) {
        this.config.onDrop(error, data);
      } else {
        console.warn(`[Topo-Tracer SDK] ${error.message}`);
      }
      return;
    }

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
    
    const nodeStarts = [...this.buffer.nodeStarts];
    const edgeStarts = [...this.buffer.edgeStarts];
    const nodeEnds = [...this.buffer.nodeEnds];
    const edgeEnds = [...this.buffer.edgeEnds];

    if (nodeStarts.length === 0 && edgeStarts.length === 0 && 
        nodeEnds.length === 0 && edgeEnds.length === 0) {
      return;
    }

    this.buffer.nodeStarts = [];
    this.buffer.edgeStarts = [];
    this.buffer.nodeEnds = [];
    this.buffer.edgeEnds = [];

    this.isFlushing = true;
    try {
      await this.ingestWithRetry({ nodeStarts, edgeStarts, nodeEnds, edgeEnds });
    } catch (error) {
       if (this.config.onDrop) {
         this.config.onDrop(error as Error, { nodeStarts, edgeStarts, nodeEnds, edgeEnds });
       } else {
         console.error(`[Topo-Tracer SDK] Ingestion failed after retries:`, error);
       }
    } finally {
      this.isFlushing = false;
    }
  }

  private async ingestWithRetry(data: any, retries = 5): Promise<void> {
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        await this.ingest(data);
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error("Ingestion failed after retries");
  }

  private async ingest(data: {
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    const payload = {
      userId: this.config.userId,
      ...data,
    };

    const response = await fetch(`${this.config.endpoint}/api/v1/ingest`, {
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
    await this.flush();
  }
}

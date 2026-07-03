import { AsyncLocalStorage } from "async_hooks";
import { 
  TracerConfig, 
  IngestNodeStart, 
  IngestEdgeStart, 
  IngestNodeEnd, 
  IngestEdgeEnd,
  IngestBatch, IngestTraceStart,
  NodeType, Importance,
  GroupLayerInput,
} from "./types";
import { Span } from "./Span";
import { randomUUID } from "crypto";

const HARD_BATCH_CAP = 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 1000;

const DEFAULT_NODE_TYPE_IMPORTANCE: Record<string, number> = {
  "controller": 0,
  "http-request": 0,
  "request": 0,
  "remote-call": 0,
  "http-client": 0,
  "outbound-http": 0,
  "remote": 0,
  "api-call": 0,
  "client": 0,
  "db-call": 0,
  "db": 0,
  "database": 0,
  "db-query": 0,
  "query": 0,
  "repository": 0,
  "io": 1,
  "file": 1,
  "network": 1,
  "stream": 1,
  "log": 2,
};

function buildIngestUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1/ingest")
    ? trimmed
    : `${trimmed}/api/v1/ingest`;
}

function createEmptyBatch(): IngestBatch {
  return {
    traceStarts: [],
    nodeStarts: [],
    edgeStarts: [],
    nodeEnds: [],
    edgeEnds: [],
  };
}

function countBatchEvents(batch: IngestBatch): number {
  return batch.traceStarts.length +
         batch.nodeStarts.length +
         batch.edgeStarts.length +
         batch.nodeEnds.length +
         batch.edgeEnds.length;
}

interface FlowContext {
  activeSpan: Span;
}

export class Tracer {
  private readonly storage = new AsyncLocalStorage<FlowContext>();
  private readonly config: TracerConfig;
  private readonly nodeTypeImportanceMapping: Record<string, number>;
  private readonly logHooks: ((message: string, data?: Record<string, string>, importanceLevel?: number) => void)[] = [];
  private readonly traceHooks: { onSpanStart?: (span: Span) => void; onSpanEnd?: (span: Span) => void }[] = [];
  private buffer: IngestBatch = createEmptyBatch();
  private flushTimer: any = null;
  private isFlushing = false;
  private flushAgain = false;
  private flushPromise: Promise<void> | null = null;

  constructor(config: TracerConfig) {
    this.config = {
      batchSize: DEFAULT_BATCH_SIZE,
      flushInterval: DEFAULT_FLUSH_INTERVAL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY,
      ignoreFailures: true,
      ...config,
    };

    if (config.logHooks) {
      this.logHooks.push(...config.logHooks);
    }
    if (config.traceHooks) {
      this.traceHooks.push(...config.traceHooks);
    }

    // Initialize nodeType importance mapping
    const customMappings = config.nodeTypeImportanceMapping || {};
    const normalizedCustomMappings: Record<string, number> = {};
    for (const [key, val] of Object.entries(customMappings)) {
      if (key !== undefined && val !== undefined) {
        normalizedCustomMappings[key.trim().toLowerCase()] = val;
      }
    }

    this.nodeTypeImportanceMapping = {
      ...DEFAULT_NODE_TYPE_IMPORTANCE,
      ...normalizedCustomMappings,
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

  addLogHook(hook: (message: string, data?: Record<string, string>, importanceLevel?: number) => void): void {
    if (hook) {
      this.logHooks.push(hook);
    }
  }

  addTraceHook(hook: { onSpanStart?: (span: Span) => void; onSpanEnd?: (span: Span) => void }): void {
    if (hook) {
      this.traceHooks.push(hook);
    }
  }

  /**
   * Fluent API for automatic context propagation.
   */
  async trace<T>(
    name: string, 
    fn: (span: Span) => Promise<T> | T, 
    options?: { 
      type?: string | NodeType, 
      importanceLevel?: number | Importance, 
      traceName?: string, 
      importanceLabels?: Record<number, string>,
      groupParentId?: string | null,
      layer?: GroupLayerInput,
    }
  ): Promise<T> {
    const span = this.startNode({ 
      name, 
      type: options?.type, 
      importanceLevel: options?.importanceLevel, 
      traceName: options?.traceName, 
      importanceLabels: options?.importanceLabels,
      groupParentId: options?.groupParentId,
      layer: options?.layer,
    });
    return this.run(span, async () => {
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
   * Captures a log message within the current trace context.
   * Logs are treated as nodes (spans) with type 'log', allowing them to participate
   * in the topological flow of the trace graph.
   *
   * @param message - The log message (becomes the node name/label).
   * @param importanceLevel - Optional importance override.
   */
  log(message: string, importanceLevel?: number | Importance): void;
  /**
   * Captures a log message within the current trace context with metadata.
   *
   * @param message - The log message (becomes the node name/label).
   * @param data - Optional key/value metadata for the log.
   * @param importanceLevel - Optional importance override.
   */
  log(message: string, data?: Record<string, string>, importanceLevel?: number | Importance): void;
  log(
    message: string,
    dataOrImportance?: Record<string, string> | number | Importance,
    importanceLevel?: number | Importance
  ): void {
    let finalData: Record<string, string> | undefined = undefined;
    let finalImportance: number | Importance | undefined = importanceLevel;

    if (dataOrImportance !== undefined && dataOrImportance !== null) {
      if (typeof dataOrImportance === "number") {
        finalImportance = dataOrImportance;
      } else if (typeof dataOrImportance === "object") {
        finalData = dataOrImportance as Record<string, string>;
      }
    }

    for (const hook of this.logHooks) {
      try {
        hook(message, finalData, finalImportance);
      } catch (error) {
        console.error("[Topo-Tracer SDK] Error in log hook:", error);
      }
    }

    const span = this.startNode({
      name: message,
      type: "log",
      data: finalData,
      importanceLevel: finalImportance,
    });
    span.end();
  }

  /**
   * Alias for startNode to match example expectations.
   */
  createSpan(name: string, options?: any): Span {
    return this.startNode({ name, ...options });
  }

  startNode(options: { 
    name: string, 
    type?: string | NodeType, 
    data?: Record<string, string>, 
    importanceLevel?: number | Importance,
    traceId?: string,
    parentSpanId?: string,
    traceName?: string,
    importanceLabels?: Record<number, string>,
    nodeName?: string, // Human-friendly code artifact identifier (e.g. "AuthController.login")
    groupParentId?: string | null,
    layer?: GroupLayerInput,
  }): Span {
    const currentStore = this.storage.getStore();
    const currentParent = currentStore?.activeSpan;
    const id = randomUUID();
    const traceId = options.traceId || currentParent?.traceId || randomUUID();
    
    let parentSpanId = options.parentSpanId;
    if (!parentSpanId && currentStore && currentParent) {
      parentSpanId = currentParent.id;
    }
    
    // Resolve importance level dynamically
    let importanceLevel = 2; // Default dynamic root level
    const explicitLevel = options.importanceLevel;
    
    if (explicitLevel !== undefined && explicitLevel !== null && explicitLevel !== Importance.DYNAMIC && explicitLevel !== -1) {
      importanceLevel = explicitLevel;
    } else {
      const typeStr = options.type ? String(options.type).trim().toLowerCase() : "default";
      if (this.nodeTypeImportanceMapping[typeStr] !== undefined) {
        importanceLevel = this.nodeTypeImportanceMapping[typeStr]!;
      } else {
        if (currentParent) {
          importanceLevel = currentParent.importanceLevel + 1;
        }
      }
    }

    const nodeStart: IngestNodeStart = {
      id,
      traceId,
      nodeType: options.type ? String(options.type) : "default",
      data: options.data || {},
      startMessage: options.name,
      startedAt: Date.now(),
      importanceLevel,
      name: options.nodeName,
      groupParentId: options.groupParentId !== undefined
        ? options.groupParentId
        : (currentParent?.id ?? null),
      layer: options.layer
        ? {
            key: options.layer.key,
            label: options.layer.label ?? options.layer.key,
            order: options.layer.order,
          }
        : null,
    };

    const traceStarts: IngestTraceStart[] = [];
    // If starting a NEW trace (no traceId provided and no existing store), emit TraceStart
    if (!options.traceId && !currentStore) {
      traceStarts.push({
        traceId,
        name: options.traceName?.trim() || options.name,
        importanceLabels: options.importanceLabels,
        timestamp: Date.now(),
      });
    }

    const span = new Span(nodeStart, (endedSpan) => {
      for (const hook of this.traceHooks) {
        if (hook.onSpanEnd) {
          try {
            hook.onSpanEnd(endedSpan);
          } catch (error) {
            console.error("[Topo-Tracer SDK] Error in trace hook onSpanEnd:", error);
          }
        }
      }

      this.addToBuffer({
        traceStarts: [],
        nodeStarts: [],
        edgeStarts: [],
        nodeEnds: [endedSpan.toNodeEnd()],
        edgeEnds: [],
      });
    });

    for (const hook of this.traceHooks) {
      if (hook.onSpanStart) {
        try {
          hook.onSpanStart(span);
        } catch (error) {
          console.error("[Topo-Tracer SDK] Error in trace hook onSpanStart:", error);
        }
      }
    }

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
    const parentContext = this.storage.getStore();
    const newContext: FlowContext = {
      activeSpan: span
    };
    return this.storage.run(newContext, fn);
  }

  extractContext(): { traceId?: string, spanId?: string } {
    const context = this.storage.getStore();
    const span = context?.activeSpan;
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
    traceStarts: IngestTraceStart[],
    nodeStarts: IngestNodeStart[],
    edgeStarts: IngestEdgeStart[],
    nodeEnds: IngestNodeEnd[],
    edgeEnds: IngestEdgeEnd[],
  }) {
    const totalCurrent = countBatchEvents(this.buffer);
    const incoming = countBatchEvents(data);

    if (totalCurrent + incoming > HARD_BATCH_CAP) {
      void this.flush();
    }

    this.buffer.traceStarts.push(...data.traceStarts);
    this.buffer.nodeStarts.push(...data.nodeStarts);
    this.buffer.edgeStarts.push(...data.edgeStarts);
    this.buffer.nodeEnds.push(...data.nodeEnds);
    this.buffer.edgeEnds.push(...data.edgeEnds);

    const newTotal = totalCurrent + incoming;
    if (newTotal >= (this.config.batchSize || DEFAULT_BATCH_SIZE)) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing) {
      this.flushAgain = true;
      return this.flushPromise ?? Promise.resolve();
    }

    this.flushPromise = this.drainBuffer();
    return this.flushPromise;
  }

  private async drainBuffer(): Promise<void> {
    this.isFlushing = true;
    try {
      do {
        this.flushAgain = false;
        const batch = this.buffer;
        this.buffer = createEmptyBatch();

        if (countBatchEvents(batch) === 0) {
          continue;
        }

        try {
          await this.ingestWithRetry(batch, this.config.maxRetries || DEFAULT_MAX_RETRIES);
        } catch (error) {
          if (this.config.onDrop) {
            try {
              this.config.onDrop(batch, `Failed to send batch after ${this.config.maxRetries} retries: ${(error as Error).message}`);
            } catch (dropError) {
              console.error(`[Topo-Tracer SDK] Error in onDrop callback:`, dropError);
            }
          } else {
            if (this.config.ignoreFailures !== false) {
              console.warn(`[Topo-Tracer SDK] Ingestion failed after retries (failures ignored):`, error);
            } else {
              console.error(`[Topo-Tracer SDK] Ingestion failed after retries:`, error);
            }
          }
          if (this.config.ignoreFailures === false) {
            throw error;
          }
        }
      } while (this.flushAgain || countBatchEvents(this.buffer) >= (this.config.batchSize || DEFAULT_BATCH_SIZE));
    } finally {
      this.isFlushing = false;
      this.flushPromise = null;
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
    const payload = this.config.userId
      ? {
          userId: this.config.userId,
          ...data,
        }
      : data;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
    };

    if (this.config.userId) {
      headers["X-User-Id"] = this.config.userId;
    }
    
    const response = await globalThis.fetch(buildIngestUrl(this.config.endpoint), {
      method: "POST",
      headers,
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

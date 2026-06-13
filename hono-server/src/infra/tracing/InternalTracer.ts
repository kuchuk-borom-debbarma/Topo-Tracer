import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { hexToUuid, spanIdToUuid } from "./context";

export type SpansBuffer = {
  traceStarts: {
    traceId: string;
    name?: string;
    importanceLabels?: Record<number, string>;
    timestamp: number;
  }[];
  nodeStarts: any[];
  nodeEnds: any[];
  edgeStarts: any[];
  edgeEnds: any[];
};

export type ActiveSpanContext = {
  traceId: string;       // 32-character hex string
  spanId: string;        // 16-character hex string
  parentSpanId?: string; // 16-character hex string
  spansBuffer: SpansBuffer;
};

/**
 * Lightweight, in-process tracer using AsyncLocalStorage.
 * Following code-base.md guidelines:
 * - Decouples tracing operations from route handlers.
 * - Collects request-scoped spans without HTTP overhead or network loops.
 */
export class InternalTracer {
  private static readonly storage = new AsyncLocalStorage<ActiveSpanContext>();

  /**
   * Retrieves the active request span context.
   */
  static getStore(): ActiveSpanContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Executes a callback function wrapped in a specific tracing context.
   */
  static run<T>(context: ActiveSpanContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /**
   * Traces an asynchronous or synchronous block of code.
   * Automatically handles parent-child relations and pushes spans to the context buffer.
   */
  // fallow-ignore-next-line complexity
  static async trace<T>(
    name: string,
    fn: (spanId: string) => Promise<T> | T,
    options?: {
      type?: string;
      importanceLevel?: number;
      traceName?: string;
      importanceLabels?: Record<number, string>;
      data?: Record<string, any>;
    }
  ): Promise<T> {
    const store = this.getStore();
    if (!store) {
      return fn(randomUUID().replace(/-/g, "").slice(0, 16));
    }

    const traceId = store.traceId;
    const parentSpanId = store.spanId;

    const spanId = randomUUID().replace(/-/g, "").slice(0, 16);

    const traceUUID = hexToUuid(traceId);
    const nodeUUID = spanIdToUuid(spanId);
    const parentUUID = parentSpanId ? spanIdToUuid(parentSpanId) : undefined;
    const startedAt = Date.now();

    if (store.spansBuffer.traceStarts.length === 0) {
      store.spansBuffer.traceStarts.push({
        traceId: traceUUID,
        name: options?.traceName ?? name,
        importanceLabels: options?.importanceLabels,
        timestamp: startedAt,
      });
    }

    store.spansBuffer.nodeStarts.push({
      id: nodeUUID,
      traceId: traceUUID,
      nodeType: options?.type || "internal",
      data: options?.data || {},
      startMessage: name,
      startedAt,
      importanceLevel: options?.importanceLevel ?? 1,
    });

    if (parentUUID) {
      store.spansBuffer.edgeStarts.push({
        id: randomUUID(),
        traceId: traceUUID,
        edgeType: "child",
        fromNodeId: parentUUID,
        toNodeId: nodeUUID,
        data: {},
        startedAt,
      });
    }

    const childContext: ActiveSpanContext = {
      traceId,
      spanId,
      parentSpanId,
      spansBuffer: store.spansBuffer,
    };

    try {
      const result = await this.storage.run(childContext, () => fn(spanId));

      store.spansBuffer.nodeEnds.push({
        id: nodeUUID,
        traceId: traceUUID,
        endedAt: Date.now(),
        status: "success",
        data: {},
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      store.spansBuffer.nodeEnds.push({
        id: nodeUUID,
        traceId: traceUUID,
        endedAt: Date.now(),
        status: "error",
        data: {
          error: errorMessage,
        },
      });
      throw error;
    }
  }
}

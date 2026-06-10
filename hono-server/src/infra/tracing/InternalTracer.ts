import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { hexToUuid, spanIdToUuid } from "./context";

export type SpansBuffer = {
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
  // fallow-ignore-next-line unused-class-member
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
      data?: Record<string, any>;
    }
  ): Promise<T> {
    const store = this.storage.getStore();
    if (!store) {
      // Bypasses tracing if no tracing context is active
      return fn("");
    }

    const traceId = store.traceId;
    const parentSpanId = store.spanId;
    // Generate a random 8-byte hex span ID (16 characters)
    const spanId = randomUUID().replace(/-/g, "").slice(0, 16);

    const traceUUID = hexToUuid(traceId);
    const nodeUUID = spanIdToUuid(spanId);
    const parentUUID = parentSpanId ? spanIdToUuid(parentSpanId) : undefined;

    const startedAt = Date.now();

    // 1. Record the span node start event
    store.spansBuffer.nodeStarts.push({
      id: nodeUUID,
      traceId: traceUUID,
      nodeType: options?.type || "internal",
      data: options?.data || {},
      startMessage: name,
      startedAt,
      importanceLevel: options?.importanceLevel ?? 1,
    });

    // 2. Record the causal link edge if a parent span exists
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

    // Run the operation inside a nested AsyncLocalStorage context
    const childContext: ActiveSpanContext = {
      traceId,
      spanId,
      parentSpanId,
      spansBuffer: store.spansBuffer,
    };

    try {
      const result = await this.storage.run(childContext, () => fn(spanId));

      // 3. Record span success end event
      store.spansBuffer.nodeEnds.push({
        id: nodeUUID,
        traceId: traceUUID,
        endedAt: Date.now(),
        status: "success",
        data: {},
      });

      return result;
    } catch (error) {
      // 3. Record span error end event
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

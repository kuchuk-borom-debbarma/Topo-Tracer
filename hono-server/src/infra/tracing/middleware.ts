import { MiddlewareHandler } from "hono";
import { randomUUID } from "crypto";
import { parseTraceParent, formatTraceParent, uuidToHex } from "./context";
import { InternalTracer, SpansBuffer } from "./InternalTracer";
import { eventBus } from "../event-bus";
import { getStringEnvValue } from "../../common/env";

/**
 * Hono global request tracing middleware.
 * Following code-base.md guidelines:
 * - Decouples route handlers from telemetry aggregation logic.
 * - Extracts and propagates W3C traceparent headers across HTTP boundaries.
 * - Flushes all collected request spans to the event bus asynchronously on request finish.
 */
// fallow-ignore-next-line complexity
export const requestTracingMiddleware = (): MiddlewareHandler => {
  // fallow-ignore-next-line complexity
  return const requestTracingMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const path = c.req.path;

    // Skip favicon noise.
    if (path === "/favicon.ico") {
      await next();
      return;
    }

    const disableSelfTracing = getStringEnvValue(c, "DISABLE_SELF_TRACING") === "true";
    const traceParentHeader = c.req.header("traceparent");

    let traceId: string;
    let parentSpanId: string | undefined;
    let sampled = true;

    if (traceParentHeader) {
      const parsed = parseTraceParent(traceParentHeader);
      traceId = parsed.traceId;
      parentSpanId = parsed.spanId;
      sampled = parsed.sampled;
    } else {
      const customTraceId = c.req.header("X-Trace-Id");
      const customSpanId = c.req.header("X-Span-Id");
      traceId = customTraceId ? uuidToHex(customTraceId) : randomUUID().replace(/-/g, "");
      parentSpanId = customSpanId ? uuidToHex(customSpanId).slice(0, 16) : undefined;
    }

    const requestSpanId = randomUUID().replace(/-/g, "").slice(0, 16);
    c.res.headers.set(
      "traceparent",
      formatTraceParent({ traceId, spanId: requestSpanId, sampled }),
    );

    const spansBuffer: SpansBuffer = {
      traceStarts: [],
      nodeStarts: [],
      nodeEnds: [],
      edgeStarts: [],
      edgeEnds: [],
    };

    const context = {
      traceId,
      spanId: requestSpanId,
      parentSpanId,
      spansBuffer,
    };

    await InternalTracer.run(context, async () => {
      const method = c.req.method;
      const traceName = `${method} ${path}`;

      await InternalTracer.trace(
        traceName,
        async () => {
          await next();
        },
        {
          type: "api",
          importanceLevel: 0,
          traceName,
          importanceLabels: {
            0: "request",
            1: "work",
            2: "detail",
          },
          data: {
            userAgent: c.req.header("user-agent") || "unknown",
            status: c.res.status,
          },
        },
      );
    });

    if (disableSelfTracing) {
      return;
    }

    const userId = "system-self-tracing";

    if (spansBuffer.nodeStarts.length > 0) {
      const payload = {
        userId,
        traceStarts: spansBuffer.traceStarts,
        nodeStarts: spansBuffer.nodeStarts,
        nodeEnds: spansBuffer.nodeEnds,
        edgeStarts: spansBuffer.edgeStarts,
        edgeEnds: spansBuffer.edgeEnds,
      };

      const publishPromise = eventBus.publish([
        {
          topic: "log.telemetry.received",
          key: userId,
          idempotencyId: `self-trace:${randomUUID()}`,
          data: payload,
        },
      ]).catch((err) => {
        console.error("[Self-Tracing] Failed to publish self-tracing spans:", err);
      });

      try {
        if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
          c.executionCtx.waitUntil(publishPromise);
        }
      } catch {
        // Fallback for non-serverless environments (like Bun/Node) where c.executionCtx getter throws.
      }
    }
  };
};;
};

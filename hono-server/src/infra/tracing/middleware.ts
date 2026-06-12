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
  return async (c, next) => {
    // Skip self-tracing for health checks or favicon requests to reduce database noise
    const path = c.req.path;
    if (path === "/" || path === "/favicon.ico") {
      await next();
      return;
    }

    const disableSelfTracing = getStringEnvValue(c, "DISABLE_SELF_TRACING") === "true";
    if (disableSelfTracing) {
      await next();
      return;
    }

    const traceParentHeader = c.req.header("traceparent");
    let traceId: string;
    let parentSpanId: string | undefined;
    let sampled = true;

    if (traceParentHeader) {
      const parsed = parseTraceParent(traceParentHeader);
      if (parsed) {
        traceId = parsed.traceId;
        parentSpanId = parsed.spanId;
        sampled = parsed.sampled;
      } else {
        // Fallback on malformed W3C header: generate a new traceId
        traceId = randomUUID().replace(/-/g, "");
      }
    } else {
      // Fallback on legacy headers or generate a new traceId
      const customTraceId = c.req.header("X-Trace-Id");
      const customSpanId = c.req.header("X-Span-Id");

      traceId = customTraceId ? uuidToHex(customTraceId) : randomUUID().replace(/-/g, "");
      parentSpanId = customSpanId ? uuidToHex(customSpanId).slice(0, 16) : undefined;
    }

    // Set traceparent response header to allow clients/browsers to track this request's self-trace ID
    const requestSpanId = randomUUID().replace(/-/g, "").slice(0, 16);
    c.res.headers.set(
      "traceparent",
      formatTraceParent({ traceId, spanId: requestSpanId, sampled })
    );

    // Initialize request-scoped spans buffer
    const spansBuffer: SpansBuffer = {
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

    // Execute Hono route handler within the active tracing storage boundary
    await InternalTracer.run(context, async () => {
      const method = c.req.method;
      
      // Trace the root API endpoint call at importance 0 (always visible)
      await InternalTracer.trace(
        `${method} ${path}`,
        async () => {
          await next();
        },
        {
          type: "api",
          importanceLevel: 0,
          data: {
            userAgent: c.req.header("user-agent") || "unknown",
            status: c.res.status,
          },
        }
      );
    });

    // Determine the tenant/user owning this telemetry run
      const userId = "system-self-tracing";

    if (spansBuffer.nodeStarts.length > 0) {
      const payload = {
        userId,
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

      // Maintain platform compatibility (e.g. serverless execution ctx waitUntil)
      try {
        if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
          c.executionCtx.waitUntil(publishPromise);
        }
      } catch {
        // Fallback for non-serverless environments (like Bun/Node) where c.executionCtx getter throws
      }
    }
  };
};

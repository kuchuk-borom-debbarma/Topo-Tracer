import { BatchExporter } from "./BatchExporter";
import { Span, SpanConfig } from "./Span";
import { TraceSpanInput, TraceEdgeInput, TracerConfig } from "./types";
import { v4 as uuidv4 } from "uuid";

export class Tracer {
  private static exporter: BatchExporter | null = null;
  private static serviceSpanId: string | null = null;
  private static loggedTraces = new Set<string>();

  /**
   * Initialize the global Tracer.
   * @param config - Configuration for the backend connection and batching.
   */
  public static init(config: TracerConfig) {
    this.exporter = new BatchExporter(config);
    this.exporter.start();
    this.serviceSpanId = uuidv4();
  }

  /**
   * Starts a completely new root trace.
   */
  public static startTrace(
    name: string, 
    opts?: SpanConfig
  ): Span {
    const traceId = uuidv4();
    return new Span({
      traceId,
      name,
      groupName: opts?.groupName,
      level: opts?.level,
      tags: opts?.tags,
    });
  }

  /**
   * Continues an existing trace from incoming request carrier context headers.
   */
  public static continueTrace(
    headers: Record<string, string | undefined>,
    name: string,
    opts?: SpanConfig
  ): Span {
    const traceId = headers["x-trace-id"] || uuidv4();
    const parentSpanId = headers["x-parent-span-id"] || null;

    const span = new Span({
      traceId,
      name,
      groupName: opts?.groupName,
      level: opts?.level,
      tags: opts?.tags,
    });

    if (parentSpanId) {
      // Connect to the remote parent span via an edge
      Tracer.exportEdge({
        id: uuidv4(),
        traceId,
        fromSpanId: parentSpanId,
        toSpanId: span.id,
        timestamp: Date.now(),
      });
    }

    return span;
  }

  /**
   * Internal method used to queue a span event for export.
   */
  public static exportSpan(span: TraceSpanInput) {
    if (this.exporter) {
      this.exporter.addSpan(span);
    }
  }

  /**
   * Internal method used to queue an edge for export.
   */
  public static exportEdge(edge: TraceEdgeInput) {
    if (this.exporter) {
      this.exporter.addEdge(edge);
    }
  }
  
  /**
   * Manually flush the current batch of telemetry to the backend.
   */
  public static async flush() {
    if (this.exporter) {
      await this.exporter.flush();
    }
  }
  
  /**
   * Flush pending telemetry and stop background timers.
   */
  public static async shutdown() {
    if (this.exporter) {
      await this.exporter.stop();
    }
  }
}


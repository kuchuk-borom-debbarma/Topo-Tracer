import { BatchExporter } from "./BatchExporter";
import { Span } from "./Span";
import { TraceSpanInput, TraceEdgeInput, TracerConfig } from "./types";
import { v4 as uuidv4 } from "uuid";

export class Tracer {
  private static exporter: BatchExporter | null = null;
  private static serviceSpanId: string | null = null;
  
  private static registeredService: { name: string; type: string; levelNames: Record<number, string> } | null = null;
  private static loggedTraces = new Set<string>();

  /**
   * Initialize the global Tracer.
   * @param config - Configuration for the backend connection and batching.
   * @param serviceConfig - Metadata describing the current service boundary.
   */
  public static init(
    config: TracerConfig, 
    serviceConfig: { id?: string; name: string; type?: string; levelNames?: Record<number, string> }
  ) {
    this.exporter = new BatchExporter(config);
    this.exporter.start();

    this.serviceSpanId = serviceConfig.id || uuidv4();
    this.registeredService = {
      name: serviceConfig.name,
      type: serviceConfig.type || "Logical Module",
      levelNames: serviceConfig.levelNames || {},
    };
  }

  /**
   * Gets the generated or provided ID for this service instance boundary.
   */
  public static getServiceSpanId(): string {
    if (!this.serviceSpanId) {
      throw new Error("Tracer not initialized. Call Tracer.init() first.");
    }
    return this.serviceSpanId;
  }

  /**
   * Helper to dynamic-register a service trace on start if it hasn't been logged yet.
   */
  public static exportServiceSpanForTrace(traceId: string, levelNames?: Record<number, string>) {
    if (!this.exporter || !this.registeredService) return;
    const key = `${traceId}:${this.getServiceSpanId()}`;
    if (!this.loggedTraces.has(key)) {
      this.loggedTraces.add(key);

      const mergedLevelNames = {
        ...this.registeredService.levelNames,
        ...(levelNames || {}),
      };

      this.exporter.addSpan({
        id: this.getServiceSpanId(),
        traceId,
        parentId: null,
        name: this.registeredService.name,
        kind: "boundary",
        type: this.registeredService.type,
        tags: {},
        eventType: "started",
        timestamp: Date.now(),
        levelNames: mergedLevelNames,
      });
    }
  }

  /**
   * Starts a completely new root boundary span (e.g. at the start of a distributed trace).
   */
  public static startBoundary(
    name: string, 
    opts?: { type?: string; tags?: Record<string, string>; levelNames?: Record<number, string> }
  ): Span {
    const traceId = uuidv4();
    const serviceId = this.getServiceSpanId();
    this.exportServiceSpanForTrace(traceId, opts?.levelNames);

    return new Span({
      id: serviceId,
      traceId,
      parentId: null,
      name,
      kind: "boundary",
      viewLevel: 0,
      type: opts?.type,
      tags: opts?.tags,
      levelNames: opts?.levelNames,
    });
  }

  /**
   * Continues an existing trace from incoming request carrier context headers.
   */
  public static continueTrace(
    headers: Record<string, string | undefined>,
    name: string,
    opts?: { type?: string; tags?: Record<string, string>; viewLevel?: number }
  ): Span {
    const traceId = headers["x-trace-id"] || uuidv4();
    const parentSpanId = headers["x-parent-span-id"] || null;
    const incomingViewLevel = headers["x-view-level"] ? parseInt(headers["x-view-level"], 10) : 0;

    // Auto-align this boundary's visual level to parentLevel + 1, or use the explicit override
    const boundaryViewLevel = opts?.viewLevel !== undefined ? opts.viewLevel : incomingViewLevel + 1;

    this.exportServiceSpanForTrace(traceId);

    return new Span({
      id: this.getServiceSpanId(),
      traceId,
      parentId: parentSpanId,
      name,
      kind: "boundary",
      viewLevel: boundaryViewLevel,
      type: opts?.type,
      tags: opts?.tags,
    });
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

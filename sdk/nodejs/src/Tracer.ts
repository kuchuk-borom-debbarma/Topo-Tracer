import { v4 as uuidv4 } from "uuid";
import { BatchExporter } from "./BatchExporter";
import { TraceNode } from "./Span";
import { normalizeImportance } from "./importance";
import type { EdgeConfig, NodeConfig, TraceEventInput, TracerConfig } from "./types";

export class Tracer {
  private static exporter: BatchExporter | null = null;

  static init(config: TracerConfig) {
    this.exporter = new BatchExporter(config);
    this.exporter.start();
  }

  static startTrace(name: string, config?: NodeConfig): TraceNode {
    return new TraceNode({
      traceId: uuidv4(),
      name,
      importanceLevel: normalizeImportance(config?.importanceLevel, 0),
      data: config?.data,
    });
  }

  static continueTrace(
    headers: Record<string, string | undefined>,
    name: string,
    config?: NodeConfig,
  ): TraceNode {
    const traceId = headers["x-trace-id"] || uuidv4();
    const parentId = headers["x-parent-node-id"] || null;
    const parentImportance = normalizeImportance(Number(headers["x-parent-node-importance"] ?? 0), 0);
    return new TraceNode({
      traceId,
      name,
      parentId,
      importanceLevel: normalizeImportance(config?.importanceLevel, parentImportance),
      data: config?.data,
    });
  }

  static connect(
    traceId: string,
    fromNodeId: string,
    toNodeId: string,
    config: EdgeConfig,
  ): string {
    const edgeId = uuidv4();
    this.exportEvent({
      traceId,
      entityId: edgeId,
      entityType: "edge",
      eventType: "edge.started",
      occurredAtUnixMs: Date.now(),
      fromNodeId,
      toNodeId,
      label: config.label,
      status: "open",
      data: config.data,
    });
    if (config.endImmediately ?? true) this.endEdge(traceId, edgeId);
    return edgeId;
  }

  static endEdge(traceId: string, edgeId: string, status: "ok" | "error" | "warning" = "ok") {
    this.exportEvent({
      traceId,
      entityId: edgeId,
      entityType: "edge",
      eventType: "edge.ended",
      occurredAtUnixMs: Date.now(),
      status,
    });
  }

  static exportEvent(event: TraceEventInput) {
    this.exporter?.addEvent(event);
  }

  static async flush() {
    await this.exporter?.flush();
  }

  static async shutdown() {
    await this.exporter?.stop();
  }
}

import { v4 as uuidv4 } from "uuid";
import { BatchExporter } from "./BatchExporter";
import { TraceNode, NodeConfig } from "./Span";
import { TraceEventInput, TracerConfig } from "./types";

export class Tracer {
  private static exporter: BatchExporter | null = null;
  private static containerId = "app";
  private static containerName = "Application";
  private static containerKind = "service";
  private static announcedContainers = new Set<string>();

  public static init(config: TracerConfig) {
    this.exporter = new BatchExporter(config);
    this.exporter.start();
    this.containerId = config.containerId || "app";
    this.containerName = config.containerName || "Application";
    this.containerKind = config.containerKind || "service";
  }

  public static startTrace(name: string, opts?: NodeConfig): TraceNode {
    const traceId = uuidv4();
    this.ensureContainer(traceId, opts?.containerId || this.containerId);
    return new TraceNode({
      traceId,
      name,
      containerId: opts?.containerId || this.containerId,
      kind: opts?.kind,
      metadata: opts?.metadata,
    });
  }

  public static continueTrace(
    headers: Record<string, string | undefined>,
    name: string,
    opts?: NodeConfig,
  ): TraceNode {
    const traceId = headers["x-trace-id"] || uuidv4();
    const parentId = headers["x-parent-node-id"] || null;
    this.ensureContainer(traceId, opts?.containerId || this.containerId);
    const node = new TraceNode({
      traceId,
      name,
      parentId,
      containerId: opts?.containerId || this.containerId,
      kind: opts?.kind,
      metadata: opts?.metadata,
    });

    if (parentId) node.logEdge(parentId, node.id, "continues");
    return node;
  }

  public static exportEvent(event: TraceEventInput) {
    this.exporter?.addEvent(event);
  }

  public static async flush() {
    await this.exporter?.flush();
  }

  public static async shutdown() {
    await this.exporter?.stop();
  }

  public static ensureContainer(traceId: string, containerId: string) {
    const key = `${traceId}:${containerId}`;
    if (this.announcedContainers.has(key)) return;
    this.announcedContainers.add(key);
    this.exportEvent({
      traceId,
      entityId: containerId,
      entityType: "container",
      eventType: "container.started",
      occurredAtUnixMs: Date.now(),
      name: containerId === this.containerId ? this.containerName : containerId,
      kind: containerId === this.containerId ? this.containerKind : "container",
      status: "open",
    });
  }
}

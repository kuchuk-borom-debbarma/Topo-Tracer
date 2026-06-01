import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";
import { NodeConfig } from "./types";

export { NodeConfig };

export class TraceNode {
  public id: string;
  public traceId: string;
  public name: string;
  public containerId: string;
  private isFinished = false;

  constructor(opts: {
    id?: string;
    traceId: string;
    name: string;
    containerId: string;
    parentId?: string | null;
    kind?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    this.id = opts.id || uuidv4();
    this.traceId = opts.traceId;
    this.name = opts.name;
    this.containerId = opts.containerId;

    Tracer.ensureContainer(this.traceId, this.containerId);
    Tracer.exportEvent({
      traceId: this.traceId,
      entityId: this.id,
      entityType: "node",
      eventType: "node.started",
      occurredAtUnixMs: Date.now(),
      containerId: this.containerId,
      parentId: opts.parentId ?? null,
      name: this.name,
      kind: opts.kind ?? "operation",
      status: "open",
      metadata: opts.metadata,
    });
  }

  public startNode(name: string, config?: NodeConfig): TraceNode {
    const child = new TraceNode({
      traceId: this.traceId,
      name,
      containerId: config?.containerId || this.containerId,
      parentId: this.id,
      kind: config?.kind,
      metadata: config?.metadata,
    });
    this.logEdge(this.id, child.id, "continues");
    return child;
  }

  public logNode(name: string, config?: NodeConfig): string {
    const child = this.startNode(name, config);
    child.end(config?.status === "open" ? "ok" : config?.status);
    return child.id;
  }

  public logEdge(fromId: string, toId: string, kind: string, endImmediately = true): string {
    const edgeId = uuidv4();
    const startedAt = Date.now();
    Tracer.exportEvent({
      traceId: this.traceId,
      entityId: edgeId,
      entityType: "edge",
      eventType: "edge.started",
      occurredAtUnixMs: startedAt,
      fromId,
      toId,
      kind,
      status: "open",
    });
    if (endImmediately) {
      Tracer.exportEvent({
        traceId: this.traceId,
        entityId: edgeId,
        entityType: "edge",
        eventType: "edge.ended",
        occurredAtUnixMs: Date.now(),
        status: "ok",
      });
    }
    return edgeId;
  }

  public createCarrierHeaders(targetNodeId?: string): Record<string, string> {
    return {
      "x-trace-id": this.traceId,
      "x-parent-node-id": targetNodeId || this.id,
    };
  }

  public end(status: "ok" | "error" | "warning" = "ok") {
    if (this.isFinished) return;
    this.isFinished = true;
    Tracer.exportEvent({
      traceId: this.traceId,
      entityId: this.id,
      entityType: "node",
      eventType: "node.ended",
      occurredAtUnixMs: Date.now(),
      status,
    });
  }
}

export const Span = TraceNode;

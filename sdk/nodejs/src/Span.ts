import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";
import { normalizeImportance } from "./importance";
import type { EdgeConfig, NodeConfig } from "./types";

export type { EdgeConfig, NodeConfig };

export class TraceNode {
  readonly id: string;
  readonly traceId: string;
  readonly name: string;
  readonly importanceLevel: number;
  readonly parentId: string | null;
  private isFinished = false;

  constructor(input: {
    id?: string;
    traceId: string;
    name: string;
    importanceLevel: number;
    parentId?: string | null;
    data?: Record<string, unknown>;
  }) {
    this.id = input.id ?? uuidv4();
    this.traceId = input.traceId;
    this.name = input.name;
    this.importanceLevel = normalizeImportance(input.importanceLevel, 0);
    this.parentId = input.parentId ?? null;

    Tracer.exportEvent({
      eventId: uuidv4(),
      traceId: this.traceId,
      entityId: this.id,
      entityType: "node",
      eventType: "node.started",
      occurredAtUnixMs: Date.now(),
      name: this.name,
      importanceLevel: this.importanceLevel,
      parentId: this.parentId,
      status: "open",
      data: input.data,
    });
  }

  startNode(name: string, config?: NodeConfig): TraceNode {
    const child = new TraceNode({
      traceId: this.traceId,
      name,
      importanceLevel: normalizeImportance(config?.importanceLevel, this.importanceLevel),
      parentId: this.id,
      data: config?.data,
    });
    this.connectTo(child, { label: "continues" });
    return child;
  }

  logNode(name: string, config?: NodeConfig): string {
    const child = this.startNode(name, config);
    child.end();
    return child.id;
  }

  connectTo(target: TraceNode | string, config: EdgeConfig): string {
    const targetId = typeof target === "string" ? target : target.id;
    return Tracer.connect(this.traceId, this.id, targetId, config);
  }

  endEdge(edgeId: string, status: "ok" | "error" | "warning" = "ok") {
    Tracer.endEdge(this.traceId, edgeId, status);
  }

  createCarrierHeaders(targetNodeId?: string): Record<string, string> {
    return {
      "x-trace-id": this.traceId,
      "x-parent-node-id": targetNodeId || this.id,
      "x-parent-node-importance": String(this.importanceLevel),
    };
  }

  end(status: "ok" | "error" | "warning" = "ok") {
    if (this.isFinished) return;
    this.isFinished = true;
    Tracer.exportEvent({
      eventId: uuidv4(),
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

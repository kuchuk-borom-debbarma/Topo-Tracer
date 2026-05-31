import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";

export interface SpanConfig {
  type?: string;
  tags?: Record<string, string>;
  viewLevel?: number; // Optional override to hoist or align spans visually
}

export class Span {
  public id: string;
  public traceId: string;
  public parentId: string | null;
  public name: string;
  public kind: "boundary" | "execution";
  public viewLevel: number;
  public type: string;
  public tags: Record<string, string>;
  private isFinished = false;

  constructor(opts: {
    id?: string;
    traceId: string;
    parentId?: string | null;
    name: string;
    kind: "boundary" | "execution";
    viewLevel?: number;
    type?: string;
    tags?: Record<string, string>;
    levelNames?: Record<number, string>;
  }) {
    this.id = opts.id || uuidv4();
    this.traceId = opts.traceId;
    this.parentId = opts.parentId || null;
    this.name = opts.name;
    this.kind = opts.kind;
    this.viewLevel = opts.viewLevel !== undefined ? opts.viewLevel : 0;
    this.type = opts.type || (this.kind === "boundary" ? "Logical Module" : "function");
    this.tags = opts.tags || {};

    // Export the "started" span event
    Tracer.exportSpan({
      id: this.id,
      traceId: this.traceId,
      parentId: this.parentId,
      name: this.name,
      kind: this.kind,
      type: this.type,
      tags: this.tags,
      eventType: "started",
      timestamp: Date.now(),
      levelNames: opts.levelNames || {},
      viewLevel: this.viewLevel,
    });
  }

  /**
   * Starts a child execution span inside the current scope (a visual node card/row).
   * Automatically auto-increments viewLevel = parent.viewLevel + 1 unless overridden.
   */
  public startSpan(name: string, config?: SpanConfig): Span {
    return new Span({
      traceId: this.traceId,
      parentId: this.id,
      name,
      kind: "execution",
      viewLevel: config?.viewLevel !== undefined ? config.viewLevel : this.viewLevel + 1,
      type: config?.type,
      tags: config?.tags,
    });
  }

  /**
   * Starts a child boundary span inside the current scope (a new nested container boundary).
   * Automatically auto-increments viewLevel = parent.viewLevel + 1 unless overridden.
   */
  public startBoundary(name: string, config?: SpanConfig): Span {
    return new Span({
      traceId: this.traceId,
      parentId: this.id,
      name,
      kind: "boundary",
      viewLevel: config?.viewLevel !== undefined ? config.viewLevel : this.viewLevel + 1,
      type: config?.type || "Logical Module",
      tags: config?.tags,
    });
  }

  /**
   * Quick utility to log an instantaneous execution span (leaf node).
   */
  public logSpan(name: string, config?: SpanConfig): string {
    const child = this.startSpan(name, config);
    child.end();
    return child.id;
  }

  /**
   * Logs a directed connection edge from the current span to a target span ID.
   */
  public logEdge(toSpanId: string, edgeType?: string) {
    Tracer.exportEdge({
      id: uuidv4(),
      traceId: this.traceId,
      fromSpanId: this.id,
      toSpanId,
      type: edgeType || "flow",
      timestamp: Date.now(),
    });
  }

  /**
   * Helper to create standard network headers to propagate trace context.
   */
  public createCarrierHeaders(targetSpanId?: string): Record<string, string> {
    return {
      "x-trace-id": this.traceId,
      "x-parent-span-id": targetSpanId || this.id,
      "x-view-level": this.viewLevel.toString(),
    };
  }

  /**
   * Completes the execution of the current span scope.
   */
  public end() {
    if (this.isFinished) return;
    this.isFinished = true;

    Tracer.exportSpan({
      id: this.id,
      traceId: this.traceId,
      parentId: this.parentId,
      name: this.name,
      kind: this.kind,
      type: this.type,
      tags: this.tags,
      eventType: "ended",
      timestamp: Date.now(),
      viewLevel: this.viewLevel,
    });
  }
}

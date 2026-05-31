import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";
import { Level } from "./types";

export interface SpanConfig {
  groupName?: string;
  level?: number;
  tags?: Record<string, string>;
}

export class Span {
  public id: string;
  public traceId: string;
  public name: string;
  public groupName: string;
  public level: number;
  public tags: Record<string, string>;
  private isFinished = false;

  constructor(opts: {
    id?: string;
    traceId: string;
    name: string;
    groupName?: string;
    level?: number;
    tags?: Record<string, string>;
  }) {
    this.id = opts.id || uuidv4();
    this.traceId = opts.traceId;
    this.name = opts.name;
    // Default groupName to the span name if not provided
    this.groupName = opts.groupName || this.name;
    // Default level to INFO if not provided
    this.level = opts.level !== undefined ? opts.level : Level.INFO;
    this.tags = opts.tags || {};

    // Export the "started" span event
    Tracer.exportSpan({
      id: this.id,
      traceId: this.traceId,
      name: this.name,
      groupName: this.groupName,
      level: this.level,
      tags: this.tags,
      eventType: "started",
      timestamp: Date.now(),
    });
  }

  /**
   * Starts a child span and automatically logs a directed connection edge to it.
   */
  public startSpan(name: string, config?: SpanConfig): Span {
    const child = new Span({
      traceId: this.traceId,
      name,
      groupName: config?.groupName,
      level: config?.level,
      tags: config?.tags,
    });
    
    // Auto-wire the parent-child relationship via an edge
    this.logEdge(child.id);

    return child;
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
  public logEdge(toSpanId: string) {
    Tracer.exportEdge({
      id: uuidv4(),
      traceId: this.traceId,
      fromSpanId: this.id,
      toSpanId,
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
      name: this.name,
      groupName: this.groupName,
      level: this.level,
      tags: this.tags,
      eventType: "ended",
      timestamp: Date.now(),
    });
  }
}

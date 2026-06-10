import { randomUUID } from 'node:crypto';
import type { 
  SpanOptions, 
  IngestNodeStart, 
  IngestNodeEnd, 
  IngestEdgeStart, 
  ImportanceLevel 
} from './types.js';
import { tracer } from './Tracer.js';

export class Span {
  private id: string;
  private traceId: string;
  private startTime: number;
  private endTime?: number;
  private metadata: Record<string, string>;
  private importanceLevel: ImportanceLevel;

  constructor(private name: string, options: SpanOptions = {}) {
    this.id = randomUUID();
    this.startTime = Date.now();
    this.metadata = options.data || {};
    this.importanceLevel = options.importanceLevel || 2; // Default to NORMAL (2)

    if (options.parent) {
      this.traceId = options.parent.getTraceId();
      // Implicit edge from parent to this child
      this.emitImplicitEdge(options.parent);
    } else {
      this.traceId = randomUUID();
    }

    this.emitStart();
  }

  public getId(): string {
    return this.id;
  }

  public getTraceId(): string {
    return this.traceId;
  }

  public getName(): string {
    return this.name;
  }

  public recordData(data: Record<string, string>): void {
    Object.assign(this.metadata, data);
  }

  public end(message?: string): void {
    this.endTime = Date.now();
    this.emitEnd(message);
  }

  public startChild<T>(
    name: string, 
    options: SpanOptions = {}, 
    fn: (span: Span) => T
  ): T {
    return tracer.startSpan(name, { ...options, parent: this }, fn);
  }

  private emitStart(): void {
    const event: IngestNodeStart = {
      id: this.id,
      traceId: this.traceId,
      nodeType: 'span',
      data: this.metadata,
      startedAt: this.startTime,
      importanceLevel: this.importanceLevel,
    };
    tracer.exportEvent(event);
  }

  private emitEnd(message?: string): void {
    const event: IngestNodeEnd = {
      id: this.id,
      traceId: this.traceId,
      endedAt: this.endTime!,
      endMessage: message,
    };
    tracer.exportEvent(event);
  }

  private emitImplicitEdge(parent: Span): void {
    const event: IngestEdgeStart = {
      id: randomUUID(),
      traceId: this.traceId,
      edgeType: 'child',
      fromNodeId: parent.getId(),
      toNodeId: this.id,
      data: {},
      startedAt: this.startTime,
    };
    tracer.exportEvent(event);
  }
}

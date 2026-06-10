import { AsyncLocalStorage } from 'node:async_hooks';
import type { 
  TracerConfig, 
  SpanOptions, 
  ITelemetryExporter, 
  IngestNodeStart, 
  IngestNodeEnd, 
  IngestEdgeStart, 
  IngestEdgeEnd 
} from './types.js';
import { Span } from './Span.js';
import { randomUUID } from 'node:crypto';

export class Tracer {
  private static instance: Tracer;
  private als: AsyncLocalStorage<Span>;
  private exporter: ITelemetryExporter | null = null;
  private config: TracerConfig | null = null;

  constructor() {
    this.als = new AsyncLocalStorage<Span>();
  }

  public static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer();
    }
    return Tracer.instance;
  }

  public init(config: TracerConfig): void {
    this.config = config;
    this.exporter = config.exporter || null;
  }

  public startSpan<T>(
    name: string, 
    options: SpanOptions = {}, 
    fn: (span: Span) => T
  ): T {
    const parent = options.parent || this.getActiveSpan();
    const span = new Span(name, { ...options, parent });

    return this.als.run(span, () => {
      return fn(span);
    });
  }

  public getActiveSpan(): Span | undefined {
    return this.als.getStore();
  }

  public addEdge(fromSpan: Span, toSpan: Span, label: string = 'explicit'): void {
    const event: IngestEdgeStart = {
      id: randomUUID(),
      traceId: fromSpan.getTraceId(),
      edgeType: label,
      fromNodeId: fromSpan.getId(),
      toNodeId: toSpan.getId(),
      data: {},
      startedAt: Date.now(),
    };
    this.exportEvent(event);
  }

  public exportEvent(
    event: IngestNodeStart | IngestNodeEnd | IngestEdgeStart | IngestEdgeEnd
  ): void {
    if (this.exporter) {
      this.exporter.export(event);
    }
  }
}

export const tracer = Tracer.getInstance();

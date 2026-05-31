import { TraceSpanInput, TraceEdgeInput, TracerConfig } from "./types";

export class BatchExporter {
  private baseUrl: string;
  private batchSize: number;
  private flushIntervalMs: number;

  private spans: TraceSpanInput[] = [];
  private edges: TraceEdgeInput[] = [];

  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(config: TracerConfig) {
    this.baseUrl = config.baseUrl;
    this.batchSize = config.batchSize || 100;
    this.flushIntervalMs = config.flushIntervalMs || 2000;
  }

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch(err => console.error("[TopoTracer] Background flush failed:", err));
    }, this.flushIntervalMs);
    this.timer.unref(); // Don't keep the Node.js event loop alive just for the timer
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  public addSpan(span: TraceSpanInput) {
    this.spans.push(span);
    this.checkBatchSize();
  }

  public addEdge(edge: TraceEdgeInput) {
    this.edges.push(edge);
    this.checkBatchSize();
  }

  private checkBatchSize() {
    if (
      this.spans.length >= this.batchSize ||
      this.edges.length >= this.batchSize
    ) {
      setImmediate(() => {
        this.flush().catch(err => console.error("[TopoTracer] Batch size flush failed:", err));
      });
    }
  }

  public async flush(): Promise<void> {
    if (this.isFlushing) return;
    
    const spansToFlush = this.spans.splice(0, this.spans.length);
    const edgesToFlush = this.edges.splice(0, this.edges.length);

    if (
      spansToFlush.length === 0 &&
      edgesToFlush.length === 0
    ) {
      return;
    }

    this.isFlushing = true;

    try {
      if (spansToFlush.length > 0) {
        await this.post("/telemetry/spans", spansToFlush);
      }
      if (edgesToFlush.length > 0) {
        await this.post("/telemetry/edges", edgesToFlush);
      }
    } catch (error) {
      console.warn("[TopoTracer] Failed to flush telemetry batch. Data dropped.", error);
    } finally {
      this.isFlushing = false;
    }
  }

  private async post(path: string, data: any) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }
}

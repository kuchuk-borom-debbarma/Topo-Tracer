import { TraceEventInput, TracerConfig } from "./types";

export class BatchExporter {
  private baseUrl: string;
  private batchSize: number;
  private flushIntervalMs: number;
  private events: TraceEventInput[] = [];
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
    this.timer.unref();
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  public addEvent(event: TraceEventInput) {
    this.events.push(event);
    if (this.events.length >= this.batchSize) {
      setImmediate(() => {
        this.flush().catch(err => console.error("[TopoTracer] Batch size flush failed:", err));
      });
    }
  }

  public async flush(): Promise<void> {
    if (this.isFlushing) return;
    const eventsToFlush = this.events.splice(0, this.events.length);
    if (eventsToFlush.length === 0) return;

    this.isFlushing = true;
    try {
      await this.post("/telemetry/events", eventsToFlush);
    } catch (error) {
      console.warn("[TopoTracer] Failed to flush telemetry batch. Data dropped.", error);
    } finally {
      this.isFlushing = false;
    }
  }

  private async post(path: string, data: unknown) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }
}

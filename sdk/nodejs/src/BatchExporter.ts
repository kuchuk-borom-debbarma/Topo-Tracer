import { TraceEventInput, TracerConfig } from "./types";

export class BatchExporter {
  private events: TraceEventInput[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private consecutiveFailures = 0;
  private readonly baseUrl: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly maxQueueSize: number;

  constructor(config: TracerConfig) {
    this.baseUrl = config.baseUrl;
    this.batchSize = config.batchSize ?? 100;
    this.flushIntervalMs = config.flushIntervalMs ?? 2000;
    this.maxRetries = config.maxRetries ?? 3;
    this.maxQueueSize = config.maxQueueSize ?? 10_000;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch((error) => console.error("[TopoTracer] Background flush failed:", error));
    }, this.flushIntervalMs);
    this.timer.unref();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  addEvent(event: TraceEventInput) {
    this.events.push(event);
    if (this.events.length > this.maxQueueSize) {
      this.events.splice(0, this.events.length - this.maxQueueSize);
    }
    if (this.events.length >= this.batchSize) {
      setImmediate(() => this.flush().catch((error) => console.error("[TopoTracer] Batch flush failed:", error)));
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing) return;
    const events = this.events.splice(0, this.events.length);
    if (!events.length) return;

    this.isFlushing = true;
    try {
      const response = await fetch(`${this.baseUrl}/telemetry/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(events),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures <= this.maxRetries) {
        this.events = [...events, ...this.events].slice(0, this.maxQueueSize);
        console.warn("[TopoTracer] Failed to flush telemetry. Batch queued for retry.", error);
      } else {
        this.consecutiveFailures = 0;
        console.warn("[TopoTracer] Failed to flush telemetry. Retry budget exhausted; batch dropped.", error);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

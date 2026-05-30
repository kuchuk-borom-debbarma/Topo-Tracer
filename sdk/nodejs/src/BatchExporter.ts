import { TraceContainerInput, TraceBlockInput, TraceNodeInput, TraceEdgeInput, TracerConfig } from "./types";

export class BatchExporter {
  private baseUrl: string;
  private batchSize: number;
  private flushIntervalMs: number;

  private containers: TraceContainerInput[] = [];
  private blocks: TraceBlockInput[] = [];
  private nodes: TraceNodeInput[] = [];
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
    // Attempt one last flush
    return this.flush();
  }

  public addContainer(container: TraceContainerInput) {
    this.containers.push(container);
    this.checkBatchSize();
  }

  public addBlock(block: TraceBlockInput) {
    this.blocks.push(block);
    this.checkBatchSize();
  }

  public addNode(node: TraceNodeInput) {
    this.nodes.push(node);
    this.checkBatchSize();
  }

  public addEdge(edge: TraceEdgeInput) {
    this.edges.push(edge);
    this.checkBatchSize();
  }

  private checkBatchSize() {
    if (
      this.containers.length >= this.batchSize ||
      this.blocks.length >= this.batchSize ||
      this.nodes.length >= this.batchSize ||
      this.edges.length >= this.batchSize
    ) {
      // Use setImmediate to avoid blocking the current execution stack
      setImmediate(() => {
        this.flush().catch(err => console.error("[TopoTracer] Batch size flush failed:", err));
      });
    }
  }

  public async flush(): Promise<void> {
    if (this.isFlushing) return;
    
    const containersToFlush = this.containers.splice(0, this.containers.length);
    const blocksToFlush = this.blocks.splice(0, this.blocks.length);
    const nodesToFlush = this.nodes.splice(0, this.nodes.length);
    const edgesToFlush = this.edges.splice(0, this.edges.length);

    if (
      containersToFlush.length === 0 &&
      blocksToFlush.length === 0 &&
      nodesToFlush.length === 0 &&
      edgesToFlush.length === 0
    ) {
      return;
    }

    this.isFlushing = true;

    try {
      if (containersToFlush.length > 0) {
        await this.post("/telemetry/containers", containersToFlush);
      }
      if (blocksToFlush.length > 0) {
        await this.post("/telemetry/blocks", blocksToFlush);
      }
      if (nodesToFlush.length > 0) {
        await this.post("/telemetry/nodes", nodesToFlush);
      }
      if (edgesToFlush.length > 0) {
        await this.post("/telemetry/edges", edgesToFlush);
      }
    } catch (error) {
      // On failure, we drop to avoid memory leaks.
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


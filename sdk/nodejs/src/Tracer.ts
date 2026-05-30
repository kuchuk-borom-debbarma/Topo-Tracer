import { BatchExporter } from "./BatchExporter";
import { TraceNode } from "./TraceNode";
import { TraceContainerInput, TraceBlockInput, TraceNodeInput, TraceEdgeInput, TracerConfig, NodeType } from "./types";
import { v4 as uuidv4 } from "uuid";

export class Tracer {
  private static exporter: BatchExporter | null = null;
  private static containerId: string | null = null;
  
  private static registeredContainers = new Map<string, { name: string; type: string }>();
  private static loggedContainers = new Set<string>();

  /**
   * Initialize the global Tracer.
   * @param config - Configuration for the backend connection and batching.
   * @param containerConfig - Metadata describing the current application/container.
   */
  public static init(
    config: TracerConfig, 
    containerConfig: { id?: string; name: string; containerType?: string; type?: string }
  ) {
    this.exporter = new BatchExporter(config);
    this.exporter.start();

    this.containerId = containerConfig.id || uuidv4();
    const type = containerConfig.type || containerConfig.containerType || "Logical Module";
    
    this.registeredContainers.set(this.containerId, {
      name: containerConfig.name,
      type: type
    });
  }

  /**
   * Dynamically registers a logical container/service on the fly.
   */
  public static registerContainer(containerConfig: { id: string; name: string; containerType?: string; type?: string }) {
    const type = containerConfig.type || containerConfig.containerType || "Logical Module";
    this.registeredContainers.set(containerConfig.id, {
      name: containerConfig.name,
      type: type
    });
  }

  /**
   * Get the generated or provided ID for the current container.
   */
  public static getContainerId(): string {
    if (!this.containerId) {
      throw new Error("Tracer not initialized. Call Tracer.init() first.");
    }
    return this.containerId;
  }

  /**
   * Dynamically exports a container registration for a given trace ID if it hasn't been logged yet.
   */
  public static exportContainerForTrace(traceId: string, containerId: string) {
    if (!this.exporter) return;
    const key = `${traceId}:${containerId}`;
    if (!this.loggedContainers.has(key)) {
      this.loggedContainers.add(key);
      const config = this.registeredContainers.get(containerId) || {
        name: "Unknown Container",
        type: "Logical Module"
      };
      this.exporter.addContainer({
        id: containerId,
        traceId,
        name: config.name,
        type: config.type,
        createdAtLocal: new Date()
      });
    }
  }

  /**
   * Executes a root async operation, automatically managing the span's lifecycle (processing, error catching, and completion).
   */
  public static async trace<T>(
    name: string,
    nodeType: NodeType | string,
    fn: (node: TraceNode) => Promise<T>,
    group?: string
  ): Promise<T> {
    const node = this.startTrace(name, nodeType, group);
    node.markProcessed();
    try {
      return await fn(node);
    } catch (error: any) {
      node.metadata = { ...node.metadata, error: error.message || String(error) };
      throw error;
    } finally {
      node.markCompleted();
    }
  }

  /**
   * Starts a completely new distributed trace.
   */
  public static startTrace(name: string, nodeType: NodeType | string, group?: string): TraceNode {
    const traceId = uuidv4();
    this.exportContainerForTrace(traceId, this.getContainerId());
    return new TraceNode({
      traceId,
      containerId: this.getContainerId(),
      name,
      nodeType,
      depthIndex: 0,
      localDepthIndex: 0,
      group
    });
  }

  /**
   * Continues an existing trace (e.g. from an incoming HTTP request containing trace headers).
   */
  public static continueTrace(
    traceId: string, 
    parentNodeId: string, 
    name: string, 
    nodeType: NodeType | string, 
    parentDepthIndex: number = 0,
    group?: string,
    scheduledAtLocal?: Date
  ): TraceNode {
    this.exportContainerForTrace(traceId, this.getContainerId());
    return new TraceNode({
      traceId,
      containerId: this.getContainerId(),
      name,
      nodeType,
      parentNodeId,
      depthIndex: parentDepthIndex + 1,
      localDepthIndex: 0,
      group,
      scheduledAtLocal
    });
  }

  /**
   * Internal method used to queue a block for export.
   */
  public static exportBlock(block: TraceBlockInput) {
    if (this.exporter) {
      this.exporter.addBlock(block);
    }
  }

  /**
   * Internal method used to queue a node event for export.
   */
  public static exportNode(node: TraceNodeInput) {
    if (this.exporter) {
      this.exporter.addNode(node);
    }
  }

  /**
   * Internal method used to queue an edge for export.
   */
  public static exportEdge(edge: TraceEdgeInput) {
    if (this.exporter) {
      this.exporter.addEdge(edge);
    }
  }
  
  /**
   * Manually flush the current batch of telemetry to the backend.
   */
  public static async flush() {
    if (this.exporter) {
      await this.exporter.flush();
    }
  }
  
  /**
   * Flush pending telemetry and stop the background timer.
   */
  public static async shutdown() {
    if (this.exporter) {
      await this.exporter.stop();
    }
  }
}


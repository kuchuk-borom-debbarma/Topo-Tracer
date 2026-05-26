import { BatchExporter } from "./BatchExporter";
import { TraceNode } from "./TraceNode";
import { ContainerInput, EdgeInput, TracerConfig } from "./types";
import { v4 as uuidv4 } from "uuid";

export class Tracer {
  private static exporter: BatchExporter | null = null;
  private static containerId: string | null = null;

  /**
   * Initialize the global Tracer.
   * @param config - Configuration for the backend connection and batching.
   * @param containerConfig - Metadata describing the current application/container.
   */
  public static init(
    config: TracerConfig, 
    containerConfig: Omit<ContainerInput, "id" | "createdAtLocal"> & { id?: string }
  ) {
    this.exporter = new BatchExporter(config);
    this.exporter.start();

    this.containerId = containerConfig.id || uuidv4();
    
    this.exporter.addContainer({
      id: this.containerId,
      name: containerConfig.name,
      containerType: containerConfig.containerType,
      createdAtLocal: new Date()
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
   * Starts a completely new distributed trace.
   */
  public static startTrace(name: string, nodeType: string): TraceNode {
    const traceId = uuidv4();
    return new TraceNode({
      traceId,
      containerId: this.getContainerId(),
      name,
      nodeType,
      depthIndex: 0
    });
  }

  /**
   * Continues an existing trace (e.g. from an incoming HTTP request containing trace headers).
   */
  public static continueTrace(
    traceId: string, 
    parentNodeId: string, 
    name: string, 
    nodeType: string, 
    parentDepthIndex: number = 0
  ): TraceNode {
    return new TraceNode({
      traceId,
      containerId: this.getContainerId(),
      name,
      nodeType,
      parentNodeId,
      depthIndex: parentDepthIndex + 1
    });
  }

  /**
   * Internal method used by TraceNode to queue itself for export.
   */
  public static exportNode(node: TraceNode) {
    if (!this.exporter) return;
    this.exporter.addNode({
      id: node.id,
      traceId: node.traceId,
      containerId: node.containerId,
      parentNodeId: node.parentNodeId,
      name: node.name,
      nodeType: node.nodeType,
      depthIndex: node.depthIndex,
      metadata: node.metadata,
      initiatedAtLocal: node.initiatedAtLocal,
      processedAtLocal: node.processedAtLocal!,
      completedAtLocal: node.completedAtLocal
    });
  }

  /**
   * Internal method used to queue an edge for export.
   */
  public static exportEdge(edge: EdgeInput) {
    if (!this.exporter) return;
    this.exporter.addEdge(edge);
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

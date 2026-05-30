import { BatchExporter } from "./BatchExporter";
import { TraceContainer } from "./TraceNode";
import { TraceContainerInput, TraceNodeInput, TraceEdgeInput, TracerConfig, NodeType } from "./types";
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
  public static exportContainerForTrace(traceId: string, containerId: string, parentContainerId: string | null = null) {
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
        parentContainerId: parentContainerId,
        name: config.name,
        type: config.type,
        tags: [],
        eventType: "started",
        timestamp: Date.now()
      });
    }
  }

  /**
   * Starts a completely new root container (Distributed Trace).
   */
  public static startContainer(name: string, tags?: string[], type?: string): TraceContainer {
    const traceId = uuidv4();
    const containerId = this.getContainerId();
    this.exportContainerForTrace(traceId, containerId);

    return new TraceContainer({
      id: containerId,
      traceId,
      parentContainerId: null,
      name,
      type: type || "Logical Module",
      tags: tags || []
    });
  }

  /**
   * Executes a root async operation, automatically managing the container scope's lifecycle.
   */
  public static async trace<T>(
    name: string,
    nodeType: NodeType | string,
    fn: (container: TraceContainer) => Promise<T>
  ): Promise<T> {
    const container = this.startTrace(name, nodeType);
    try {
      return await fn(container);
    } finally {
      container.complete();
    }
  }

  /**
   * Starts a completely new distributed trace (Backward compatibility).
   */
  public static startTrace(name: string, nodeType: NodeType | string): TraceContainer {
    const traceId = uuidv4();
    const containerId = this.getContainerId();
    this.exportContainerForTrace(traceId, containerId);

    return new TraceContainer({
      id: containerId,
      traceId,
      parentContainerId: null,
      name,
      type: typeof nodeType === "string" ? nodeType : "Logical Module",
      tags: []
    });
  }

  /**
   * Continues an existing trace (e.g. from an incoming HTTP request containing trace headers).
   */
  public static continueTrace(
    traceIdOrHeaders: string | Record<string, string | undefined>,
    parentNodeIdOrName: string,
    nameOrType?: string | NodeType,
    nodeType?: NodeType | string,
    _parentDepthIndex: number = 0,
    _group?: string,
    _scheduledAtLocal?: Date,
    overrideId?: string,
    parentContainerId?: string
  ): TraceContainer {
    let traceId: string;
    let name: string;
    let type: string;
    let targetId = overrideId;
    let parentCid = parentContainerId;

    if (typeof traceIdOrHeaders === "object" && traceIdOrHeaders !== null) {
      // Extract properties implicitly from headers/carrier context
      traceId = traceIdOrHeaders["x-trace-id"] || uuidv4();
      parentCid = traceIdOrHeaders["x-parent-container-id"] || undefined;
      targetId = traceIdOrHeaders["x-target-node-id"] || undefined;
      
      name = parentNodeIdOrName;
      type = (nameOrType as string) || "Logical Module";
    } else {
      // Backward compatibility signature
      traceId = traceIdOrHeaders;
      name = nameOrType as string;
      type = (nodeType as string) || "Logical Module";
    }

    this.exportContainerForTrace(traceId, this.getContainerId(), parentCid || null);
    return new TraceContainer({
      id: targetId || this.getContainerId(),
      traceId,
      parentContainerId: this.getContainerId(),
      name,
      type,
      tags: []
    });
  }

  /**
   * Internal method used to queue a container event for export.
   */
  public static exportContainer(container: TraceContainerInput) {
    if (this.exporter) {
      this.exporter.addContainer(container);
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

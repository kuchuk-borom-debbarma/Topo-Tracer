import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";
import { NodeType, EdgeType } from "./types";

export class TraceContainer {
  public id: string;
  public traceId: string;
  public parentContainerId: string | null;
  public name: string;
  public type: string;
  public tags: string[];
  public depthIndex: number = 0;
  private isFinished = false;

  constructor(opts: {
    id?: string;
    traceId: string;
    parentContainerId?: string | null;
    name: string;
    type?: string;
    tags?: string[];
    depthIndex?: number;
  }) {
    this.id = opts.id || uuidv4();
    this.traceId = opts.traceId;
    this.parentContainerId = opts.parentContainerId || null;
    this.name = opts.name;
    this.type = opts.type || "Logical Module";
    this.tags = opts.tags || [];
    this.depthIndex = opts.depthIndex || 0;

    // Automatically append dynamic depth tag for internal functions (nested sub-containers)
    if (this.depthIndex > 0) {
      const depthTag = `internal_function_depth_${this.depthIndex}`;
      if (!this.tags.includes(depthTag)) {
        this.tags.push(depthTag);
      }
    }

    // Export "started" event for this container
    Tracer.exportContainer({
      id: this.id,
      traceId: this.traceId,
      parentContainerId: this.parentContainerId,
      name: this.name,
      type: this.type,
      tags: this.tags,
      eventType: "started",
      timestamp: Date.now(),
    });
  }

  /**
   * Logs a leaf chronological node inside this container (instantaneous event).
   */
  public logNode(name: string, tags?: string[], metadata?: any, nodeType?: NodeType | string): string {
    const nodeId = uuidv4();
    const type = nodeType || NodeType.FUNCTION;
    const resolvedTags = tags || [];

    Tracer.exportNode({
      id: nodeId,
      traceId: this.traceId,
      containerId: this.id,
      name,
      type,
      tags: resolvedTags,
      eventType: "started",
      timestamp: Date.now(),
      metadata: metadata || null,
    });

    Tracer.exportNode({
      id: nodeId,
      traceId: this.traceId,
      containerId: this.id,
      name,
      type,
      tags: resolvedTags,
      eventType: "ended",
      timestamp: Date.now(),
      metadata: metadata || null,
    });

    return nodeId;
  }

  /**
   * Starts a long-running chronological node inside this container.
   */
  public startNode(name: string, tags?: string[], metadata?: any, nodeType?: NodeType | string) {
    const nodeId = uuidv4();
    const type = nodeType || NodeType.FUNCTION;
    const resolvedTags = tags || [];

    Tracer.exportNode({
      id: nodeId,
      traceId: this.traceId,
      containerId: this.id,
      name,
      type,
      tags: resolvedTags,
      eventType: "started",
      timestamp: Date.now(),
      metadata: metadata || null,
    });

    return {
      id: nodeId,
      complete: (endMetadata?: any) => {
        Tracer.exportNode({
          id: nodeId,
          traceId: this.traceId,
          containerId: this.id,
          name,
          type,
          tags: resolvedTags,
          eventType: "ended",
          timestamp: Date.now(),
          metadata: endMetadata || metadata || null,
        });
      }
    };
  }

  /**
   * Starts a nested child container under this container in the current call hierarchy.
   */
  public startChildContainer(name: string, tags?: string[], type?: string): TraceContainer {
    return new TraceContainer({
      traceId: this.traceId,
      parentContainerId: this.id,
      name,
      type: type || "Logical Module",
      tags: tags || [],
      depthIndex: this.depthIndex + 1,
    });
  }

  /**
   * Logs a connection edge between a node and a target (either a node or a container).
   */
  public logEdge(fromNodeId: string, toId: string, toType: "node" | "container", edgeType?: EdgeType | string) {
    Tracer.exportEdge({
      id: uuidv4(),
      traceId: this.traceId,
      fromNodeId,
      toId,
      toType,
      type: edgeType || "flow",
      timestamp: Date.now(),
    });
  }

  /**
   * Helper to create standard network carrier headers to propagate trace context across service boundaries.
   */
  public createCarrierHeaders(callerNodeId: string, targetContainerId: string): Record<string, string> {
    return {
      "x-trace-id": this.traceId,
      "x-parent-node-id": callerNodeId,
      "x-parent-container-id": this.id,
      "x-target-node-id": targetContainerId,
      "x-depth-index": this.depthIndex.toString(),
    };
  }

  /**
   * Completes the container execution scope.
   */
  public complete() {
    if (this.isFinished) return;
    this.isFinished = true;

    Tracer.exportContainer({
      id: this.id,
      traceId: this.traceId,
      parentContainerId: this.parentContainerId,
      name: this.name,
      type: this.type,
      tags: this.tags,
      eventType: "ended",
      timestamp: Date.now(),
    });
  }
}

export default TraceContainer;

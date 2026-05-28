import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";

export class TraceNode {
  public id: string;
  public traceId: string;
  public containerId: string;
  public parentNodeId?: string;
  public name: string;
  public nodeType: string;
  public depthIndex: number;
  public localDepthIndex: number;
  public group?: string;
  
  public metadata?: any;
  public initiatedAtLocal: Date;
  public processedAtLocal?: Date;
  public completedAtLocal?: Date;
  
  private isFinished = false;
  private activeEdges: ActiveEdge[] = [];

  constructor(opts: {
    traceId: string;
    containerId: string;
    name: string;
    nodeType: string;
    parentNodeId?: string;
    depthIndex: number;
    localDepthIndex: number;
    group?: string;
  }) {
    this.id = uuidv4();
    this.traceId = opts.traceId;
    this.containerId = opts.containerId;
    this.name = opts.name;
    this.nodeType = opts.nodeType;
    this.parentNodeId = opts.parentNodeId;
    this.depthIndex = opts.depthIndex;
    this.localDepthIndex = opts.localDepthIndex;
    this.group = opts.group || `${opts.containerId}_${opts.depthIndex}`;
    this.initiatedAtLocal = new Date();
  }

  /**
   * Starts a child node under this node in the current container's call stack.
   */
  public startChild(name: string, nodeType: string, group?: string): TraceNode {
    return new TraceNode({
      traceId: this.traceId,
      containerId: this.containerId,
      name,
      nodeType,
      parentNodeId: this.id,
      depthIndex: this.depthIndex + 1,
      localDepthIndex: this.localDepthIndex + 1,
      group
    });
  }

  /**
   * Marks the node as actively processing (e.g. queue waiting time is over).
   */
  public markProcessed() {
    if (!this.processedAtLocal) {
      this.processedAtLocal = new Date();
    }
  }

  /**
   * Marks the node as completed and queues it for export to the backend.
   */
  public markCompleted(metadata?: any) {
    if (this.isFinished) return;
    this.isFinished = true;
    
    if (!this.processedAtLocal) {
      this.processedAtLocal = new Date();
    }
    this.completedAtLocal = new Date();
    this.metadata = metadata;

    // Auto-complete any active edges that were forgotten/never completed
    for (const edge of this.activeEdges) {
      edge.autoComplete();
    }

    Tracer.exportNode(this);
  }

  /**
   * Records a network hop to another container/service.
   * Returns a stateful ActiveEdge handle that can be completed later.
   */
  public recordEgressEdge(toContainerId: string, toNodeId: string, edgeType: string): ActiveEdge {
    const edge = new ActiveEdge({
      traceId: this.traceId,
      fromContainerId: this.containerId,
      toContainerId,
      fromNodeId: this.id,
      toNodeId,
      edgeType
    });
    this.activeEdges.push(edge);
    return edge;
  }
}

export class ActiveEdge {
  private id: string;
  private traceId: string;
  private fromContainerId: string;
  private toContainerId: string;
  private fromNodeId: string;
  private toNodeId: string;
  private edgeType: string;
  private dispatchedAtLocal: Date;
  private respondedAtLocal?: Date;
  private isFinished = false;

  constructor(opts: {
    traceId: string;
    fromContainerId: string;
    toContainerId: string;
    fromNodeId: string;
    toNodeId: string;
    edgeType: string;
  }) {
    this.id = uuidv4();
    this.traceId = opts.traceId;
    this.fromContainerId = opts.fromContainerId;
    this.toContainerId = opts.toContainerId;
    this.fromNodeId = opts.fromNodeId;
    this.toNodeId = opts.toNodeId;
    this.edgeType = opts.edgeType;
    this.dispatchedAtLocal = new Date();
  }

  public getEdgeId(): string {
    return this.id;
  }

  public complete() {
    if (this.isFinished) return;
    this.isFinished = true;
    this.respondedAtLocal = new Date();
    this.export();
  }

  public autoComplete() {
    if (this.isFinished) return;
    this.isFinished = true;
    // Keep respondedAtLocal undefined as it was never officially completed
    this.export();
  }

  private export() {
    Tracer.exportEdge({
      id: this.id,
      traceId: this.traceId,
      fromContainerId: this.fromContainerId,
      toContainerId: this.toContainerId,
      fromNodeId: this.fromNodeId,
      toNodeId: this.toNodeId,
      edgeType: this.edgeType,
      dispatchedAtLocal: this.dispatchedAtLocal,
      respondedAtLocal: this.respondedAtLocal
    });
  }
}

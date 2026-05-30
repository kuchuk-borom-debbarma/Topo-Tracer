import { v4 as uuidv4 } from "uuid";
import { Tracer } from "./Tracer";
import { NodeType, EdgeType } from "./types";

export class TraceNode {
  public id: string;
  public traceId: string;
  public containerId: string;
  public parentNodeId?: string;
  public name: string;
  public nodeType: NodeType | string;
  public depthIndex: number = 0;
  
  public metadata?: any;
  public initiatedAtLocal: Date;
  public completedAtLocal?: Date;
  public incomingEdge?: ActiveEdge;

  // Immutable block identity — never changes even when this.id is mutated externally
  private readonly _blockId: string;
  // Immutable block ID of the parent node — for correct "Call Finished:" attribution
  private _parentBlockId: string = "";

  // Block calling structures
  public parentCallerNodeId?: string;
  public parentEdgeId?: string;
  public parentEdgeType?: string;
  
  private isFinished = false;
  private activeEdges: ActiveEdge[] = [];

  constructor(opts: {
    traceId: string;
    containerId: string;
    name: string;
    nodeType: NodeType | string;
    parentNodeId?: string;
    depthIndex?: number;
    localDepthIndex?: number;
    group?: string;
    scheduledAtLocal?: Date;
    /** Override the node/block ID (e.g. to match a pre-assigned targetNodeId from the caller). */
    overrideId?: string;
  }) {
    this.id = opts.overrideId || uuidv4();
    // _blockId is locked here — mutations to this.id won't affect block references
    this._blockId = this.id;

    this.traceId = opts.traceId;
    this.containerId = opts.containerId;
    this.name = opts.name;
    this.nodeType = opts.nodeType;
    this.parentNodeId = opts.parentNodeId;
    this.depthIndex = opts.depthIndex || 0;
    this.initiatedAtLocal = new Date();

    // 1. Export the TraceBlock using the immutable _blockId
    Tracer.exportBlock({
      id: this._blockId,
      traceId: this.traceId,
      containerId: this.containerId,
      name: this.name,
      type: this.nodeType,
      metadata: this.metadata
    });

    // 2. Export the "started" node checkpoint — also uses _blockId so it
    //    stays consistent even if this.id is later mutated by the caller
    Tracer.exportNode({
      id: this._blockId,
      traceId: this.traceId,
      blockId: this._blockId,
      name: this.name,
      type: this.nodeType,
      eventType: "started",
      eventAtLocal: this.initiatedAtLocal,
      metadata: this.metadata
    });
  }

  /**
   * Starts a child node under this node in the current container's call stack.
   */
  public startChild(name: string, nodeType: NodeType | string, group?: string, scheduledAtLocal?: Date): TraceNode {
    const childNode = new TraceNode({
      traceId: this.traceId,
      containerId: this.containerId,
      name,
      nodeType,
      parentNodeId: this._blockId,     // Use immutable parent blockId
      depthIndex: this.depthIndex + 1,
    });

    // Wire back the parent's immutable block ID for Call Finished attribution
    childNode._parentBlockId = this._blockId;

    // callerNodeId is keyed off the child's immutable blockId (not child.id which may be mutated)
    const callerNodeId = childNode._blockId + "_caller";
    const edgeId = childNode._blockId + "_edge";

    // Log the "started" calling node event in THIS block (using this._blockId)
    Tracer.exportNode({
      id: callerNodeId,
      traceId: this.traceId,
      blockId: this._blockId,
      name: `Call: ${name}`,
      type: nodeType,
      eventType: "started",
      eventAtLocal: childNode.initiatedAtLocal,
      metadata: null
    });

    // Log the "requested" edge event — both endpoints use immutable blockIds
    Tracer.exportEdge({
      id: edgeId,
      traceId: this.traceId,
      fromNodeId: callerNodeId,
      toNodeId: childNode._blockId,
      type: "function_call",
      eventType: "requested",
      eventAtLocal: childNode.initiatedAtLocal,
      metadata: null
    });

    childNode.parentCallerNodeId = callerNodeId;
    childNode.parentEdgeId = edgeId;
    childNode.parentEdgeType = "function_call";

    return childNode;
  }

  /**
   * Starts a child node in a different logical container, automatically establishing
   * and tracking the network egress edge transition.
   */
  public startChildInContainer(opts: {
    containerId: string;
    containerName?: string;
    containerType?: string;
    name: string;
    nodeType: NodeType | string;
    edgeType?: EdgeType | string;
    group?: string;
    scheduledAtLocal?: Date;
  }): TraceNode {
    if (opts.containerName) {
      Tracer.registerContainer({
        id: opts.containerId,
        name: opts.containerName,
        containerType: opts.containerType || "Logical Module"
      });
    }

    Tracer.exportContainerForTrace(this.traceId, opts.containerId);

    const childNode = new TraceNode({
      traceId: this.traceId,
      containerId: opts.containerId,
      name: opts.name,
      nodeType: opts.nodeType,
      parentNodeId: this._blockId,
      depthIndex: this.depthIndex + 1,
    });

    childNode._parentBlockId = this._blockId;

    const callerNodeId = childNode._blockId + "_caller";
    const edgeType = opts.edgeType || EdgeType.HTTP_REQUEST;
    const edgeId = childNode._blockId + "_edge";

    Tracer.exportNode({
      id: callerNodeId,
      traceId: this.traceId,
      blockId: this._blockId,
      name: `Call Container: ${opts.name}`,
      type: opts.nodeType,
      eventType: "started",
      eventAtLocal: childNode.initiatedAtLocal,
      metadata: null
    });

    childNode.parentCallerNodeId = callerNodeId;
    childNode.parentEdgeId = edgeId;
    childNode.parentEdgeType = edgeType;

    const activeEdge = new ActiveEdge({
      id: edgeId,
      traceId: this.traceId,
      blockId: this._blockId,
      fromNodeId: callerNodeId,
      toNodeId: childNode._blockId,
      edgeType: edgeType,
      dispatchedAtLocal: childNode.initiatedAtLocal
    });
    this.activeEdges.push(activeEdge);
    childNode.incomingEdge = activeEdge;

    return childNode;
  }

  /**
   * Executes a child async operation under this node in the current container.
   */
  public async traceChild<T>(
    name: string,
    nodeType: NodeType | string,
    fn: (childNode: TraceNode) => Promise<T>,
    group?: string
  ): Promise<T> {
    const childNode = this.startChild(name, nodeType, group);
    try {
      return await fn(childNode);
    } catch (error: any) {
      childNode.metadata = { ...childNode.metadata, error: error.message || String(error) };
      throw error;
    } finally {
      childNode.markCompleted();
    }
  }

  /**
   * Executes a child async operation in a different logical container.
   */
  public async traceChildInContainer<T>(
    opts: {
      containerId: string;
      containerName?: string;
      containerType?: string;
      name: string;
      nodeType: NodeType | string;
      edgeType?: EdgeType | string;
      group?: string;
      scheduledAtLocal?: Date;
    },
    fn: (childNode: TraceNode) => Promise<T>
  ): Promise<T> {
    const childNode = this.startChildInContainer(opts);
    try {
      return await fn(childNode);
    } catch (error: any) {
      childNode.metadata = { ...childNode.metadata, error: error.message || String(error) };
      throw error;
    } finally {
      childNode.markCompleted();
    }
  }

  // Backward-compatibility empty helpers
  public suspend() {}
  public resume()  {}
  public markProcessed() {}

  public markCompleted(metadata?: any) {
    if (this.isFinished) return;
    this.isFinished = true;
    
    this.completedAtLocal = new Date();
    this.metadata = metadata;

    for (const edge of this.activeEdges) {
      edge.autoComplete();
    }
    if (this.incomingEdge) {
      this.incomingEdge.complete();
    }

    // 1. Export "ended" event using the immutable _blockId
    Tracer.exportNode({
      id: this._blockId,
      traceId: this.traceId,
      blockId: this._blockId,
      name: this.name,
      type: this.nodeType,
      eventType: "ended",
      eventAtLocal: this.completedAtLocal,
      metadata: this.metadata
    });

    // 2. Export caller node "ended" in the PARENT block using the parent's immutable blockId
    if (this.parentCallerNodeId) {
      Tracer.exportNode({
        id: this.parentCallerNodeId,
        traceId: this.traceId,
        blockId: this._parentBlockId,       // ← parent's immutable blockId (not parentNodeId)
        name: `Call Finished: ${this.name}`,
        type: this.nodeType,
        eventType: "ended",
        eventAtLocal: this.completedAtLocal,
        metadata: null
      });
    }

    // 3. Export parent edge "responded"
    if (this.parentEdgeId) {
      Tracer.exportEdge({
        id: this.parentEdgeId,
        traceId: this.traceId,
        fromNodeId: this.parentCallerNodeId || "",
        toNodeId: this._blockId,             // ← immutable blockId
        type: this.parentEdgeType || "function_call",
        eventType: "responded",
        eventAtLocal: this.completedAtLocal,
        metadata: null
      });
    }
  }

  /**
   * Records a network hop to another container/service.
   */
  public recordEgressEdge(toContainerId: string, toNodeId: string, edgeType: EdgeType | string): ActiveEdge {
    const callerNodeId = toNodeId + "_caller";
    const edgeId = toNodeId + "_edge";

    Tracer.exportNode({
      id: callerNodeId,
      traceId: this.traceId,
      blockId: this._blockId,       // ← use immutable blockId
      name: `Egress Call to Container ${toContainerId}`,
      type: NodeType.HTTP_CLIENT,
      eventType: "started",
      eventAtLocal: new Date(),
      metadata: null
    });

    const activeEdge = new ActiveEdge({
      id: edgeId,
      traceId: this.traceId,
      blockId: this._blockId,       // ← use immutable blockId
      fromNodeId: callerNodeId,
      toNodeId: toNodeId,
      edgeType: edgeType,
      dispatchedAtLocal: new Date()
    });

    this.activeEdges.push(activeEdge);
    return activeEdge;
  }
}

export class ActiveEdge {
  private id: string;
  private traceId: string;
  private blockId: string;
  private fromNodeId: string;
  private toNodeId: string;
  private edgeType: EdgeType | string;
  private dispatchedAtLocal: Date;
  private isFinished = false;

  constructor(opts: {
    id: string;
    traceId: string;
    blockId: string;
    fromNodeId: string;
    toNodeId: string;
    edgeType: EdgeType | string;
    dispatchedAtLocal: Date;
  }) {
    this.id = opts.id;
    this.traceId = opts.traceId;
    this.blockId = opts.blockId;
    this.fromNodeId = opts.fromNodeId;
    this.toNodeId = opts.toNodeId;
    this.edgeType = opts.edgeType;
    this.dispatchedAtLocal = opts.dispatchedAtLocal;

    Tracer.exportEdge({
      id: this.id,
      traceId: this.traceId,
      fromNodeId: this.fromNodeId,
      toNodeId: this.toNodeId,
      type: this.edgeType,
      eventType: "requested",
      eventAtLocal: this.dispatchedAtLocal,
      metadata: null
    });
  }

  public getEdgeId(): string { return this.id; }

  public complete() {
    if (this.isFinished) return;
    this.isFinished = true;
    const now = new Date();

    Tracer.exportEdge({
      id: this.id,
      traceId: this.traceId,
      fromNodeId: this.fromNodeId,
      toNodeId: this.toNodeId,
      type: this.edgeType,
      eventType: "responded",
      eventAtLocal: now,
      metadata: null
    });

    Tracer.exportNode({
      id: this.fromNodeId,
      traceId: this.traceId,
      blockId: this.blockId,
      name: `Egress Call Finished`,
      type: NodeType.HTTP_CLIENT,
      eventType: "ended",
      eventAtLocal: now,
      metadata: null
    });
  }

  public autoComplete() { this.complete(); }
}

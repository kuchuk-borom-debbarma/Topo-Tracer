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
  public depthIndex: number;
  public localDepthIndex: number;
  public group?: string;
  
  public metadata?: any;
  public initiatedAtLocal: Date;
  public processedAtLocal?: Date;
  public completedAtLocal?: Date;
  public scheduledAtLocal?: Date;
  public cpuActiveDurationUs?: number;
  public suspendedAtLocal: Date[] = [];
  public resumedAtLocal: Date[] = [];
  public incomingEdge?: ActiveEdge;

  // New properties to manage block calling structures
  public parentCallerNodeId?: string;
  public parentEdgeId?: string;
  public parentEdgeType?: string;
  
  private isFinished = false;
  private activeEdges: ActiveEdge[] = [];
  private startCpuUsage: NodeJS.CpuUsage;

  constructor(opts: {
    traceId: string;
    containerId: string;
    name: string;
    nodeType: NodeType | string;
    parentNodeId?: string;
    depthIndex: number;
    localDepthIndex: number;
    group?: string;
    scheduledAtLocal?: Date;
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
    this.scheduledAtLocal = opts.scheduledAtLocal;
    this.initiatedAtLocal = new Date();
    this.startCpuUsage = process.cpuUsage();

    // 1. Export the TraceBlock immediately upon creation
    Tracer.exportBlock({
      id: this.id,
      traceId: this.traceId,
      containerId: this.containerId,
      name: this.name,
      type: this.nodeType,
      metadata: this.metadata
    });

    // 2. Export the "started" node checkpoint inside this block
    Tracer.exportNode({
      id: this.id,
      traceId: this.traceId,
      blockId: this.id,
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
      parentNodeId: this.id,
      depthIndex: this.depthIndex + 1,
      localDepthIndex: this.localDepthIndex + 1,
      group,
      scheduledAtLocal
    });

    const callerNodeId = childNode.id + "_caller";
    const edgeId = childNode.id + "_edge";

    // Log the "started" calling node event in the parent block (this.id)
    Tracer.exportNode({
      id: callerNodeId,
      traceId: this.traceId,
      blockId: this.id,
      name: `Call: ${name}`,
      type: nodeType,
      eventType: "started",
      eventAtLocal: childNode.initiatedAtLocal,
      metadata: null
    });

    // Log the "requested" edge event
    Tracer.exportEdge({
      id: edgeId,
      traceId: this.traceId,
      fromNodeId: callerNodeId,
      toNodeId: childNode.id,
      type: "function_call",
      eventType: "requested",
      eventAtLocal: childNode.initiatedAtLocal,
      metadata: null
    });

    // Keep context references for lifecycle cleanup
    childNode.parentCallerNodeId = callerNodeId;
    childNode.parentEdgeId = edgeId;
    childNode.parentEdgeType = "function_call";

    return childNode;
  }

  /**
   * Starts a child node in a different logical container, automatically establishing
   * and tracking the network egress edge transition with zero boilerplate.
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
    // 1. Auto-register the logical container if details are provided
    if (opts.containerName) {
      Tracer.registerContainer({
        id: opts.containerId,
        name: opts.containerName,
        containerType: opts.containerType || 'Logical Module'
      });
    }

    // Ensure container-trace mapping is exported for the child container
    Tracer.exportContainerForTrace(this.traceId, opts.containerId);

    // 2. Instantiate child node (resets localDepthIndex back to 0 across boundaries)
    const childNode = new TraceNode({
      traceId: this.traceId,
      containerId: opts.containerId,
      name: opts.name,
      nodeType: opts.nodeType,
      parentNodeId: this.id,
      depthIndex: this.depthIndex + 1,
      localDepthIndex: 0,
      group: opts.group,
      scheduledAtLocal: opts.scheduledAtLocal
    });

    // 3. Mark context transition as processed
    childNode.markProcessed();

    // 4. Create and wire the stateful connection edge (egress arrow) from this block to child block
    const callerNodeId = childNode.id + "_caller";
    const edgeType = opts.edgeType || EdgeType.HTTP_REQUEST;
    const edgeId = childNode.id + "_edge";

    // Log the "started" calling node event in the parent block (this.id)
    Tracer.exportNode({
      id: callerNodeId,
      traceId: this.traceId,
      blockId: this.id,
      name: `Call Container: ${opts.name}`,
      type: opts.nodeType,
      eventType: "started",
      eventAtLocal: childNode.initiatedAtLocal,
      metadata: null
    });

    // Keep context references for lifecycle cleanup
    childNode.parentCallerNodeId = callerNodeId;
    childNode.parentEdgeId = edgeId;
    childNode.parentEdgeType = edgeType;

    // Create the stateful ActiveEdge wrapper for backward-compatibility workflows
    const activeEdge = new ActiveEdge({
      id: edgeId,
      traceId: this.traceId,
      blockId: this.id,
      fromNodeId: callerNodeId,
      toNodeId: childNode.id,
      edgeType: edgeType,
      dispatchedAtLocal: childNode.initiatedAtLocal
    });
    this.activeEdges.push(activeEdge);

    // Store a reference to the active edge on child node so it completes automatically!
    childNode.incomingEdge = activeEdge;

    return childNode;
  }

  /**
   * Executes a child async operation under this node in the current container, automatically
   * managing lifecycle processes, error catch logs, and guaranteed completion.
   */
  public async traceChild<T>(
    name: string,
    nodeType: NodeType | string,
    fn: (childNode: TraceNode) => Promise<T>,
    group?: string
  ): Promise<T> {
    const childNode = this.startChild(name, nodeType, group);
    childNode.markProcessed();
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
   * Executes a child async operation in a different logical container, automatically
   * establishing edge connections and managing node lifecycles with guaranteed auto-completion.
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

  /**
   * Suspend context execution (e.g. paused waiting for async I/O).
   */
  public suspend() {
    this.suspendedAtLocal.push(new Date());
  }

  /**
   * Resume context execution (e.g. back in processing block).
   */
  public resume() {
    this.resumedAtLocal.push(new Date());
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

    const elapsedCpu = process.cpuUsage(this.startCpuUsage);
    this.cpuActiveDurationUs = elapsedCpu.user + elapsedCpu.system;

    // Auto-complete any active edges that were forgotten/never completed
    for (const edge of this.activeEdges) {
      edge.autoComplete();
    }

    // Auto-complete incoming edge transition if dynamic context helper was used
    if (this.incomingEdge) {
      this.incomingEdge.complete();
    }

    // 1. Export the block's main entry node "ended" event
    Tracer.exportNode({
      id: this.id,
      traceId: this.traceId,
      blockId: this.id,
      name: this.name,
      type: this.nodeType,
      eventType: "ended",
      eventAtLocal: this.completedAtLocal,
      metadata: this.metadata
    });

    // 2. Export the parent calling node "ended" event in the parent block context
    if (this.parentCallerNodeId) {
      const parentBlockId = this.parentNodeId || "";
      Tracer.exportNode({
        id: this.parentCallerNodeId,
        traceId: this.traceId,
        blockId: parentBlockId,
        name: `Call Finished: ${this.name}`,
        type: this.nodeType,
        eventType: "ended",
        eventAtLocal: this.completedAtLocal,
        metadata: null
      });
    }

    // 3. Export the parent edge "responded" event
    if (this.parentEdgeId) {
      Tracer.exportEdge({
        id: this.parentEdgeId,
        traceId: this.traceId,
        fromNodeId: this.parentCallerNodeId || "",
        toNodeId: this.id,
        type: this.parentEdgeType || "function_call",
        eventType: "responded",
        eventAtLocal: this.completedAtLocal,
        metadata: null
      });
    }
  }

  /**
   * Records a network hop to another container/service.
   * Returns a stateful ActiveEdge handle that can be completed later.
   */
  public recordEgressEdge(toContainerId: string, toNodeId: string, edgeType: EdgeType | string): ActiveEdge {
    const callerNodeId = toNodeId + "_caller";
    const edgeId = toNodeId + "_edge";

    // Export the "started" calling node event in this node's block context
    Tracer.exportNode({
      id: callerNodeId,
      traceId: this.traceId,
      blockId: this.id,
      name: `Egress Call to Container ${toContainerId}`,
      type: NodeType.HTTP_CLIENT,
      eventType: "started",
      eventAtLocal: new Date(),
      metadata: null
    });

    const activeEdge = new ActiveEdge({
      id: edgeId,
      traceId: this.traceId,
      blockId: this.id,
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

    // Export the "requested" edge event immediately
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

  public getEdgeId(): string {
    return this.id;
  }

  public complete() {
    if (this.isFinished) return;
    this.isFinished = true;
    const now = new Date();

    // Export the "responded" edge event
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

    // Export the "ended" calling node event in the parent block context
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

  public autoComplete() {
    this.complete();
  }
}


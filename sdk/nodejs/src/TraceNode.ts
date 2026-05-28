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
  }

  /**
   * Starts a child node under this node in the current container's call stack.
   */
  public startChild(name: string, nodeType: NodeType | string, group?: string, scheduledAtLocal?: Date): TraceNode {
    return new TraceNode({
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

    // 4. Create and wire the stateful connection edge (egress arrow) from this node to child node
    const edgeType = opts.edgeType || EdgeType.HTTP_REQUEST;
    const activeEdge = this.recordEgressEdge(opts.containerId, childNode.id, edgeType);

    // 5. Store a reference to the active edge on child node so it completes automatically!
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

    Tracer.exportNode(this);
  }

  /**
   * Records a network hop to another container/service.
   * Returns a stateful ActiveEdge handle that can be completed later.
   */
  public recordEgressEdge(toContainerId: string, toNodeId: string, edgeType: EdgeType | string): ActiveEdge {
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
  private edgeType: EdgeType | string;
  private dispatchedAtLocal: Date;
  private respondedAtLocal?: Date;
  private isFinished = false;

  constructor(opts: {
    traceId: string;
    fromContainerId: string;
    toContainerId: string;
    fromNodeId: string;
    toNodeId: string;
    edgeType: EdgeType | string;
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

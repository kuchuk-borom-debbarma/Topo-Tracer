import { LogRepo } from "../LogRepo";
import type { Container, Node, Edge, PaginationParams, PaginatedTraceResult } from "../../types";

export class MockLogRepo extends LogRepo {
  // In-memory data store
  public savedContainers: Container[] = [];
  public savedNodes: Node[] = [];
  public savedEdges: Edge[] = [];

  // Configurable read behaviors
  private mockTraceResult: PaginatedTraceResult = {
    nodes: [],
    edges: [],
    isZoomReady: false,
    maxAvailableDepth: 0,
    pagination: {
      prevTimeCursor: null,
      prevIdCursor: null,
      nextTimeCursor: null,
      nextIdCursor: null,
      hasPrev: false,
      hasNext: false,
    },
  };

  public lastTraceIdFetched = "";
  public lastParamsUsed: PaginationParams = {};

  // Stub configuration helpers
  public setFetchTraceResult(result: PaginatedTraceResult): void {
    this.mockTraceResult = result;
  }

  // Repository implementations
  override async saveContainer(container: Container): Promise<void> {
    this.savedContainers.push(container);
  }

  override async saveContainers(containers: Container[]): Promise<void> {
    this.savedContainers.push(...containers);
  }

  override async saveNode(node: Node): Promise<void> {
    this.savedNodes.push(node);
  }

  override async saveNodes(nodes: Node[]): Promise<void> {
    this.savedNodes.push(...nodes);
  }

  override async saveEdge(edge: Edge): Promise<void> {
    this.savedEdges.push(edge);
  }

  override async saveEdges(edges: Edge[]): Promise<void> {
    this.savedEdges.push(...edges);
  }

  override async fetchTracePaginated(traceId: string, params: PaginationParams): Promise<PaginatedTraceResult> {
    this.lastTraceIdFetched = traceId;
    this.lastParamsUsed = params;
    return this.mockTraceResult;
  }

  override async listTraces(params: import("../../types").TracePaginationParams): Promise<import("../../types").PaginatedResult<import("../../types").TraceSummary>> {
    return {
      data: [],
      pagination: {
        prevTimeCursor: null,
        prevIdCursor: null,
        nextTimeCursor: null,
        nextIdCursor: null,
        hasPrev: false,
        hasNext: false
      }
    };
  }
}

import type { Container, Node, Edge, PaginationParams, PaginatedResult, PaginatedTraceResult } from "../types";

export class LogRepo {
  async saveContainer(container: Container): Promise<void> {}
  async saveContainers(containers: Container[]): Promise<void> {}

  async saveNode(node: Node): Promise<void> {}
  async saveNodes(nodes: Node[]): Promise<void> {}

  async saveEdge(edge: Edge): Promise<void> {}
  async saveEdges(edges: Edge[]): Promise<void> {}

  async fetchTracePaginated(traceId: string, params: PaginationParams): Promise<PaginatedTraceResult> {
    return { nodes: [], edges: [], pagination: { prevTimeCursor: null, prevIdCursor: null, nextTimeCursor: null, nextIdCursor: null, hasPrev: false, hasNext: false }, isZoomReady: false, maxAvailableDepth: 0 };
  }

  async fetchTraceMetadata(traceId: string): Promise<import("../types").TraceMetadataResult> {
    return { isZoomReady: false, maxAvailableDepth: 0 };
  }
}

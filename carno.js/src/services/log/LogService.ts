import type { ContainerInput, NodeInput, EdgeInput, PaginationParams, PaginatedResult, PaginatedTraceResult } from "./types";

export class LogService {
  async logContainer(container: ContainerInput): Promise<void> {}
  async logContainers(containers: ContainerInput[]): Promise<void> {}

  async logNode(node: NodeInput): Promise<void> {}
  async logNodes(nodes: NodeInput[]): Promise<void> {}

  async logEdge(edge: EdgeInput): Promise<void> {}
  async logEdges(edges: EdgeInput[]): Promise<void> {}

  async updateContainerLocalTimes(containers: ContainerInput[], newTime?: Date): Promise<ContainerInput[]> {
    return [];
  }

  async updateNodeLocalTimes(nodes: NodeInput[], newTime?: Date): Promise<NodeInput[]> {
    return [];
  }

  async updateEdgeLocalTimes(edges: EdgeInput[], newTime?: Date): Promise<EdgeInput[]> {
    return [];
  }

  async logTracePaginated(traceId: string, params: PaginationParams): Promise<PaginatedTraceResult> {
    return { nodes: [], edges: [], pagination: { prevTimeCursor: null, prevIdCursor: null, nextTimeCursor: null, nextIdCursor: null, hasPrev: false, hasNext: false }, isZoomReady: false, maxAvailableDepth: 0, maxAvailableLocalDepth: 0 };
  }

  async logTraceFull(traceId: string, depth?: number, depthType: 'global' | 'local' = 'global'): Promise<import("./types").FullTraceResult> {
    return { nodes: [], edges: [], isZoomReady: false, maxAvailableDepth: 0, maxAvailableLocalDepth: 0 };
  }

  async fetchTraceMetadata(traceId: string): Promise<import("./types").TraceMetadataResult> {
    return { isZoomReady: false, maxAvailableDepth: 0, maxAvailableLocalDepth: 0 };
  }

  async listTraces(params: import("./types").TracePaginationParams): Promise<import("./types").PaginatedResult<import("./types").TraceSummary>> {
    return { data: [], pagination: { prevTimeCursor: null, prevIdCursor: null, nextTimeCursor: null, nextIdCursor: null, hasPrev: false, hasNext: false } };
  }
}



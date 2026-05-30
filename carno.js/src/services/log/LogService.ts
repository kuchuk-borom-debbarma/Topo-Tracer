import type { 
  TraceContainerInput, 
  TraceEdgeInput, 
  TraceNodeInput, 
  TraceLayoutResponse,
  TraceListResponse
} from "./types";

export class LogService {
  async logContainers(containers: TraceContainerInput[]): Promise<void> {}
  async logNodes(nodes: TraceNodeInput[]): Promise<void> {}
  async logEdges(edges: TraceEdgeInput[]): Promise<void> {}
  async getTraceLayout(traceId: string): Promise<TraceLayoutResponse | null> { return null; }
  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    return { traces: [], total: 0, page, limit, totalPages: 0 };
  }
}

import type { 
  TraceSpanInput, 
  TraceEdgeInput, 
  TraceLayoutResponse,
  TraceListResponse
} from "./types";

export class LogService {
  async logSpans(spans: TraceSpanInput[]): Promise<void> {}
  async logEdges(edges: TraceEdgeInput[]): Promise<void> {}
  async getTraceLayout(traceId: string, maxLevel?: number): Promise<TraceLayoutResponse | null> { return null; }
  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    return { traces: [], total: 0, page, limit, totalPages: 0 };
  }
}

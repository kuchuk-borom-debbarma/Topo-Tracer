import type { TraceBlockInput, TraceContainerInput, TraceEdgeInput, TraceNodeInput, TraceLayoutResponse } from "./types";

export type TraceListItem = {
  traceId: string;
  isZoomReady: boolean;
  maxAvailableDepth: number;
  createdAt: number;
  containerNames: string[];
};

export type TraceListResponse = {
  traces: TraceListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export class LogService {
  async logContainers(containers: TraceContainerInput[]): Promise<void> {}
  async logBlocks(blocks: TraceBlockInput[]): Promise<void> {}
  async logNodes(nodes: TraceNodeInput[]): Promise<void> {}
  async logEdges(edges: TraceEdgeInput[]): Promise<void> {}
  async getTraceLayout(traceId: string, zoomLevel?: number): Promise<TraceLayoutResponse | null> { return null; }
  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    return { traces: [], total: 0, page, limit, totalPages: 0 };
  }
}



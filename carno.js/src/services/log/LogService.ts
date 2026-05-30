import type { TraceBlockInput, TraceContainerInput, TraceEdgeInput, TraceNodeInput } from "./types";

export class LogService {
  async logContainers(containers: TraceContainerInput[]): Promise<void> {}
  async logBlocks(blocks: TraceBlockInput[]): Promise<void> {}
  async logNodes(nodes: TraceNodeInput[]): Promise<void> {}
  async logEdges(edges: TraceEdgeInput[]): Promise<void> {}
  async getTraceLayout(traceId: string, zoomLevel?: number): Promise<any> { return null; }
}


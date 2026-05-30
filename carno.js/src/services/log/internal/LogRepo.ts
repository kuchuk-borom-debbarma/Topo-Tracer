import type { TraceBlock, TraceContainer, TraceEdge, TraceNode } from "../types";

export class LogRepo {
  async saveContainers(containers: TraceContainer[]): Promise<void> {}
  async saveBlocks(blocks: TraceBlock[]): Promise<void> {}
  async saveNodes(nodes: TraceNode[]): Promise<void> {}
  async saveEdges(edges: TraceEdge[]): Promise<void> {}

  async fetchContainers(traceId: string): Promise<TraceContainer[]> { return []; }
  async fetchBlocks(traceId: string): Promise<TraceBlock[]> { return []; }
  async fetchCollapsedNodes(traceId: string): Promise<any[]> { return []; }
  async fetchRawEdges(traceId: string): Promise<TraceEdge[]> { return []; }

  async saveReadBlocks(blocks: any[]): Promise<void> {}
  async saveReadNodes(nodes: any[]): Promise<void> {}
  async saveReadEdges(edges: any[]): Promise<void> {}
  async saveTraceMetadata(metadata: any): Promise<void> {}

  async fetchTraceMetadata(traceId: string): Promise<any> { return null; }
  async fetchReadBlocks(traceId: string): Promise<any[]> { return []; }
  async fetchReadNodes(traceId: string, zoomLevel: number): Promise<any[]> { return []; }
  async fetchReadEdges(traceId: string): Promise<any[]> { return []; }
}



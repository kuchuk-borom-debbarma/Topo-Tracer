import type { 
  TraceBlock, 
  TraceContainer, 
  TraceEdge, 
  TraceNode, 
  ReadBlock, 
  ReadNode, 
  ReadEdge, 
  TraceMetadata, 
  TraceNodeCollapsed 
} from "../types";

/**
 * Data repository interface for persisting raw telemetry and retrieving pre-computed visual layouts.
 */
export class LogRepo {
  // Raw telemetries
  async saveContainers(containers: TraceContainer[]): Promise<void> {}
  async saveBlocks(blocks: TraceBlock[]): Promise<void> {}
  async saveNodes(nodes: TraceNode[]): Promise<void> {}
  async saveEdges(edges: TraceEdge[]): Promise<void> {}

  // Worker raw data fetchers
  async fetchContainers(traceId: string): Promise<TraceContainer[]> { return []; }
  async fetchBlocks(traceId: string): Promise<TraceBlock[]> { return []; }
  async fetchCollapsedNodes(traceId: string): Promise<TraceNodeCollapsed[]> { return []; }
  async fetchRawEdges(traceId: string): Promise<TraceEdge[]> { return []; }

  // Worker coordinates savers
  async saveReadBlocks(blocks: ReadBlock[]): Promise<void> {}
  async saveReadNodes(nodes: ReadNode[]): Promise<void> {}
  async saveReadEdges(edges: ReadEdge[]): Promise<void> {}
  async saveTraceMetadata(metadata: TraceMetadata): Promise<void> {}

  // Reader layout fetchers
  async fetchTraceMetadata(traceId: string): Promise<TraceMetadata | null> { return null; }
  async fetchReadBlocks(traceId: string): Promise<ReadBlock[]> { return []; }
  async fetchReadNodes(traceId: string, zoomLevel: number): Promise<ReadNode[]> { return []; }
  async fetchReadEdges(traceId: string): Promise<ReadEdge[]> { return []; }

  // Traces listing
  async fetchTracesList(page: number, limit: number): Promise<{ traceId: string; isZoomReady: boolean; maxAvailableDepth: number; createdAt: number; containerNames: string[] }[]> { return []; }
  async fetchTracesCount(): Promise<number> { return 0; }
}




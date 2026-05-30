import type { 
  TraceContainer, 
  TraceEdge, 
  TraceNode, 
  ReadContainer, 
  ReadNode, 
  ReadEdge, 
  TraceMetadata, 
  TraceListItem
} from "../types";

/**
 * Data repository interface for persisting raw telemetry and retrieving pre-computed V3 visual layouts.
 */
export class LogRepo {
  // Raw telemetries (Write path)
  async saveContainers(containers: TraceContainer[]): Promise<void> {}
  async saveNodes(nodes: TraceNode[]): Promise<void> {}
  async saveEdges(edges: TraceEdge[]): Promise<void> {}

  // Worker raw data fetchers
  async fetchContainers(traceId: string): Promise<TraceContainer[]> { return []; }
  async fetchNodes(traceId: string): Promise<TraceNode[]> { return []; }
  async fetchRawEdges(traceId: string): Promise<TraceEdge[]> { return []; }

  // Worker coordinates savers
  async saveReadContainers(containers: ReadContainer[]): Promise<void> {}
  async saveReadNodes(nodes: ReadNode[]): Promise<void> {}
  async saveReadEdges(edges: ReadEdge[]): Promise<void> {}
  async saveTraceMetadata(metadata: TraceMetadata): Promise<void> {}
  async saveReadTrace(trace: { traceId: string; containerIds: string[]; tags: string[]; createdAt: number }): Promise<void> {}

  // Reader layout fetchers
  async fetchTraceMetadata(traceId: string): Promise<TraceMetadata | null> { return null; }
  async fetchReadContainers(traceId: string): Promise<ReadContainer[]> { return []; }
  async fetchReadNodes(traceId: string): Promise<ReadNode[]> { return []; }
  async fetchReadEdges(traceId: string): Promise<ReadEdge[]> { return []; }

  // Traces listing
  async fetchTracesList(page: number, limit: number): Promise<TraceListItem[]> { return []; }
  async fetchTracesCount(): Promise<number> { return 0; }
}

import type { 
  TraceSpan, 
  TraceEdge, 
  ReadSpan, 
  ReadEdge, 
  TraceListItem
} from "../types";

/**
 * Data repository interface for persisting raw telemetry and retrieving pre-computed V4 visual layouts.
 */
export class LogRepo {
  // Raw telemetries (Write path)
  async saveSpans(spans: TraceSpan[]): Promise<void> {}
  async saveEdges(edges: TraceEdge[]): Promise<void> {}

  // Worker raw data fetchers
  async fetchSpans(traceId: string): Promise<TraceSpan[]> { return []; }
  async fetchRawEdges(traceId: string): Promise<TraceEdge[]> { return []; }

  // Worker coordinates savers
  async saveReadSpans(spans: ReadSpan[]): Promise<void> {}
  async saveReadEdges(edges: ReadEdge[]): Promise<void> {}
  async saveReadTrace(trace: { 
    traceId: string; 
    containerIds: string[]; 
    tags: string[]; 
    levelNames: Record<number, string>; 
    layoutJson: string; 
    createdAt: number; 
  }): Promise<void> {}

  // Reader layout fetchers
  async fetchReadTraceMeta(traceId: string): Promise<{ levelNames: Record<number, string>; layoutJson: string } | null> { return null; }
  async fetchReadSpans(traceId: string): Promise<ReadSpan[]> { return []; }
  async fetchReadEdges(traceId: string): Promise<ReadEdge[]> { return []; }

  // Traces listing
  async fetchTracesList(page: number, limit: number): Promise<TraceListItem[]> { return []; }
  async fetchTracesCount(): Promise<number> { return 0; }
}

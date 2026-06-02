import type {
  GraphWindowQuery,
  GraphWindowResponse,
  GraphProjectionResult,
  ReadEdge,
  ReadNode,
  TraceEventInput,
  TraceEventRecord,
  TraceListResponse,
  TraceSummary,
} from "./types";

export type RawEventAppendResult = {
  count: number;
  traceIds: string[];
  eventIds: string[];
};

export interface RawEventStore {
  append(events: TraceEventInput[]): Promise<RawEventAppendResult>;
  listTraceIdsNeedingMaterialization(limit?: number): Promise<string[]>;
  getTraceEvents(traceId: string): Promise<TraceEventRecord[]>;
}

export interface TraceReadModelStore {
  saveTraceReadModel(input: {
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: TraceSummary;
  }): Promise<void>;
  getSummary(traceId: string): Promise<TraceSummary | null>;
  listTraces(page: number, limit: number): Promise<TraceListResponse>;
  getProjectedGraph(input: {
    traceId: string;
    maxImportance: number;
    limit: number;
    offset: number;
  }): Promise<GraphProjectionResult>;
}

export interface TraceReadModelProjector {
  build(traceId: string, events: TraceEventRecord[]): {
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: TraceSummary;
  } | null;
}

export interface TraceLogService {
  ingestEvents(events: TraceEventInput[]): Promise<{ ok: true; count: number }>;
  listTraces(page: number, limit: number): Promise<TraceListResponse>;
  getTraceSummary(traceId: string): Promise<TraceSummary | null>;
  getGraph(traceId: string, query: GraphWindowQuery): Promise<GraphWindowResponse | null>;
}

export type JsonObject = Record<string, unknown>;

export type ReadNode = {
  id: string;
  traceId: string;
  name: string;
  importanceLevel: number;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  flowOrder: number;
  diagnostics: string[];
  data: JsonObject;
  isGhost?: boolean;
  hiddenNodeCount?: number;
  hiddenErrorCount?: number;
  hiddenDurationMs?: number | null;
};

export type GraphEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  diagnostics: string[];
  data: JsonObject;
  isGhost?: boolean;
  hiddenEdgeCount?: number;
};

export type TraceSummary = {
  traceId: string;
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
  nodeCount: number;
  edgeCount: number;
  errorCount: number;
  diagnosticCount: number;
  maxImportanceLevel: number;
  materializedAtUnixMs: number;
};

export type TraceListResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type GraphWindowResponse = {
  metadata: {
    traceId: string;
    maxImportance: number;
    limit: number;
    returnedNodeCount: number;
    totalNodeCount: number;
    hiddenNodeCount: number;
    ghostNodeCount: number;
    hasBefore: boolean;
    hasAfter: boolean;
    previousCursor: string | null;
    nextCursor: string | null;
  };
  summary: TraceSummary;
  nodes: ReadNode[];
  edges: GraphEdge[];
};

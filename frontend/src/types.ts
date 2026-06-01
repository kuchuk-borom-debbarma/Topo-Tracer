export type JsonObject = Record<string, unknown>;

export type TraceSummary = {
  traceId: string;
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
  containerCount: number;
  nodeCount: number;
  edgeCount: number;
  errorCount: number;
  diagnosticCount: number;
  materializedAtUnixMs: number;
};

export type ReadContainer = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  ancestryIds: string[];
  diagnostics: string[];
  metadata: JsonObject;
};

export type ReadNode = {
  id: string;
  traceId: string;
  containerId: string | null;
  parentId: string | null;
  name: string;
  kind: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  ancestryIds: string[];
  flowOrder: number;
  diagnostics: string[];
  metadata: JsonObject;
};

export type ReadEdge = {
  id: string;
  traceId: string;
  fromId: string;
  toId: string;
  kind: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  diagnostics: string[];
  metadata: JsonObject;
};

export type TraceListResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FlowWindowResponse = {
  metadata: {
    traceId: string;
    anchorId: string | null;
    detailBudget: number;
    returnedNodeCount: number;
    totalNodeCount: number;
    omittedNodeCount: number;
    omittedEdgeCount: number;
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
    previousCursor: string | null;
    nextCursor: string | null;
  };
  summary: TraceSummary;
  containers: ReadContainer[];
  nodes: ReadNode[];
  edges: ReadEdge[];
};

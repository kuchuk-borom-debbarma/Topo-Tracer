export type JsonObject = Record<string, unknown>;

export type TraceEventType = "node.started" | "node.ended" | "edge.started" | "edge.ended";
export type TraceEntityType = "node" | "edge";

export type TraceEventInput = {
  eventId?: string;
  traceId: string;
  entityId: string;
  entityType: TraceEntityType;
  eventType: TraceEventType;
  occurredAtUnixMs: number;
  name?: string | null;
  depth?: number | null;
  parentId?: string | null;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  label?: string | null;
  status?: "ok" | "error" | "warning" | "open" | null;
  data?: JsonObject;
};

export type TraceEventRecord = Required<
  Pick<TraceEventInput, "traceId" | "entityId" | "entityType" | "eventType" | "occurredAtUnixMs">
> & {
  eventId: string;
  receivedAtUnixMs: number;
  name: string | null;
  depth: number | null;
  parentId: string | null;
  fromNodeId: string | null;
  toNodeId: string | null;
  label: string | null;
  status: string | null;
  data: JsonObject;
};

export type DiagnosticCode =
  | "clockSkewSuspected"
  | "negativeDuration"
  | "missingStart"
  | "missingEnd"
  | "cycleDetected"
  | "orphanNode"
  | "orphanEdge";

export type ReadNode = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  depth: number;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  ancestryPath: string[];
  flowOrder: number;
  diagnostics: DiagnosticCode[];
  data: JsonObject;
};

export type ReadEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  durationMs: number | null;
  diagnostics: DiagnosticCode[];
  data: JsonObject;
};

export type GhostNode = ReadNode & {
  isGhost: true;
  hiddenNodeCount: number;
  hiddenErrorCount: number;
};

export type GraphEdge = ReadEdge & {
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
  maxDepth: number;
  materializedAtUnixMs: number;
};

export type TraceListResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type GraphWindowQuery = {
  maxDepth?: number;
  limit?: number;
  cursor?: string;
};

export type GraphWindowResponse = {
  metadata: {
    traceId: string;
    maxDepth: number;
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
  nodes: Array<ReadNode | GhostNode>;
  edges: GraphEdge[];
};

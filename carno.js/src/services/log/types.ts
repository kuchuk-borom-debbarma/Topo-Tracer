export type JsonObject = Record<string, unknown>;

export type TraceEventType =
  | "container.started"
  | "container.ended"
  | "node.started"
  | "node.ended"
  | "edge.started"
  | "edge.ended";

export type TraceEntityType = "container" | "node" | "edge";

export type TraceEventInput = {
  eventId?: string;
  traceId: string;
  entityId: string;
  entityType: TraceEntityType;
  eventType: TraceEventType;
  occurredAtUnixMs: number;
  parentId?: string | null;
  containerId?: string | null;
  fromId?: string | null;
  toId?: string | null;
  kind?: string | null;
  name?: string | null;
  status?: "ok" | "error" | "warning" | "open" | null;
  metadata?: JsonObject;
};

export type TraceEventRecord = Required<
  Pick<
    TraceEventInput,
    | "traceId"
    | "entityId"
    | "entityType"
    | "eventType"
    | "occurredAtUnixMs"
  >
> & {
  eventId: string;
  receivedAtUnixMs: number;
  parentId: string | null;
  containerId: string | null;
  fromId: string | null;
  toId: string | null;
  kind: string | null;
  name: string | null;
  status: string | null;
  metadata: JsonObject;
};

export type DiagnosticCode =
  | "clockSkewSuspected"
  | "negativeDuration"
  | "missingStart"
  | "missingEnd"
  | "cycleDetected"
  | "orphanNode"
  | "orphanEdge";

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
  diagnostics: DiagnosticCode[];
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
  diagnostics: DiagnosticCode[];
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
  diagnostics: DiagnosticCode[];
  metadata: JsonObject;
};

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

export type TraceListResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FlowWindowQuery = {
  anchorId?: string;
  direction?: "around" | "before" | "after";
  before?: number;
  after?: number;
  expandedIds?: string[];
  hiddenIds?: string[];
  detailBudget?: number;
  cursor?: string;
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

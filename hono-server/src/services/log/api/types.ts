/**
 * Raw Trace Start event shape for high-level metadata.
 */
export type IngestTraceStart = {
  traceId: string;
  name?: string;
  importanceLabels?: Record<number, string>;
  timestamp: number; // UTC Milliseconds
};

/**
 * Raw Node Start event shape for telemetry ingestion.
 */
export type IngestNodeStart = {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  name?: string; // Human-friendly code artifact identifier (e.g. ClassName.methodName(Args))
  startMessage?: string;
  startedAt: number; // UTC Milliseconds
  importanceLevel: number; // Used for projection filtering
};

/**
 * Raw Node End event shape for telemetry ingestion.
 */
export type IngestNodeEnd = {
  id: string;
  traceId: string;
  endedAt: number; // UTC Milliseconds
  endMessage?: string;
};

/**
 * Raw Edge Start event shape for telemetry ingestion.
 */
export type IngestEdgeStart = {
  id: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  data: Record<string, string>;
  startedAt: number; // UTC Milliseconds
};

/**
 * Raw Edge End event shape for telemetry ingestion.
 */
export type IngestEdgeEnd = {
  id: string;
  traceId: string;
  endedAt: number; // UTC Milliseconds
};

/**
 * Complete batch payload for telemetry ingestion.
 */
export type IngestBatch = {
  userId: string;
  traceStarts: IngestTraceStart[];
  nodeStarts: IngestNodeStart[];
  edgeStarts: IngestEdgeStart[];
  nodeEnds: IngestNodeEnd[];
  edgeEnds: IngestEdgeEnd[];
};

/**
 * Materialized Read-Optimized Node.
 */
export type ReadNode = {
  id: string;
  userId: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  name: string | null;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
  startMessage: string | null;
  endMessage: string | null;
  importanceLevel: number;
  flowOrder: number;
  materializedAt: number;
};

/**
 * Materialized Read-Optimized Edge.
 */
export type ReadEdge = {
  id: string;
  userId: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  fromFlowOrder: number;
  toFlowOrder: number;
  data: Record<string, string>;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
  materializedAt: number;
};

/**
 * Materialized Trace Summary metadata.
 */
export type ReadTraceSummary = {
  userId: string;
  traceId: string;
  name: string;
  importanceLabels: Record<number, string>;
  nodeCount: number;
  edgeCount: number;
  minImportanceLevel: number;
  maxImportanceLevel: number;
  startedAt: number;
  endedAt: number | null;
  materializedAt: number;

  diagMissingStarts: number;
  diagMissingEnds: number;
  diagNegativeDurations: number;
  diagCycles: number;
  diagOrphanEdges: number;
  diagInvalidImportance: number;
  diagClockSkew: number;
  diagLimitExceeded: number;
};

export type TraceListResult = {
  traces: ReadTraceSummary[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ReadCheckpoint = {
  userId: string;
  traceId: string;
  lastTraceEventTime: number;
  lastNodeEventTime: number;
  lastNodeEventId: string;
  lastNodeEventType: number;
  lastEdgeEventTime: number;
  lastEdgeEventId: string;
  lastEdgeEventType: number;
  checkpointedAt: number;
};

export type ProjectionReadCap = {
  cap: number;
  returnedCount: number;
  capHit: boolean;
};

export type BoundedVisibleNodesResult = {
  nodes: ReadNode[];
  cap: ProjectionReadCap;
};

export type BoundedVisibleEdgesResult = {
  edges: ReadEdge[];
  cap: ProjectionReadCap;
};

export type ProjectedNormalNode = {
  kind: "normal";
  id: string;
  nodeType: string;
  data: Record<string, string>;
  name?: string | null;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
  importanceLevel: number;
  flowOrder: number;
  materializedAt: number;
  startMessage?: string | null;
};

export type ProjectedGhostNode = {
  kind: "ghost";
  id: string;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
  nodeTypeCounts: Record<string, number>;
  minImportanceLevel: number;
  maxImportanceLevel: number;
  startedAt: number;
  endedAt: number | null;
  flowOrderStart: number;
  flowOrderEnd: number;
};

export type ProjectedFlowNode = ProjectedNormalNode | ProjectedGhostNode;

export type ProjectedFlowEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  edgeCount: number;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
};

export type ProjectedFlowMetadata = {
  threshold: number;
  returnedNodeCount: number;
  returnedEdgeCount: number;
  visibleNodeCount: number;
  ghostNodeCount: number;
  materializedAt: number;
  nodeCap: ProjectionReadCap;
  edgeCap: ProjectionReadCap;
  omittedEdgeCount: number;
  paging: {
    nextCursor: string | null;
    previousCursor: string | null;
    hasAfter: boolean;
    hasBefore: boolean;
    totalNodeCount: number;
    fromFlowOrder: number;
    toFlowOrder: number;
  };
};

export type ProjectedFlowResult = {
  nodes: ProjectedFlowNode[];
  edges: ProjectedFlowEdge[];
  metadata: ProjectedFlowMetadata;
};

export type PagingParams = {
  offset: number;
  limit: number;
};

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  hasMore: boolean;
};

export type BoundedProjectionNodesResult = {
  nodes: ReadNode[];
  cap: ProjectionReadCap;
};

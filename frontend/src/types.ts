export type User = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedApiKey = ApiKey & {
  key: string;
};

export type TraceSummary = {
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
  traces: TraceSummary[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ProjectedNormalNode = {
  kind: "normal";
  id: string;
  nodeType: string;
  data: Record<string, string>;
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

export type ProjectionReadCap = {
  cap: number;
  returnedCount: number;
  capHit: boolean;
};

export type ProjectedFlowResult = {
  nodes: ProjectedFlowNode[];
  edges: ProjectedFlowEdge[];
  metadata: {
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
};

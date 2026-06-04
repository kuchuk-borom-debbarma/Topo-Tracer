export type IngestNodeStart = {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startMessage?: string;
  startedAt: number; //UTC Milisecond
  importanceLevel: number;
};

export type IngestNodeEnd = {
  id: string;
  traceId: string;
  endedAt: number; //UTC Milisecond
  endMessage?: string;
};
export type IngestEdgeStart = {
  id: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  data: Record<string, string>;
  startedAt: number; //UTC Milisecond
};
export type IngestEdgeEnd = {
  id: string;
  traceId: string;
  endedAt: number; //UTC Milisecond
};

export type ReadNode = {
  id: string;
  userId: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startedAt: number;
  endedAt: number | null;
  startMessage: string | null;
  endMessage: string | null;
  importanceLevel: number;
  flowOrder: number;
  materializedAt: number;
};

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
  materializedAt: number;
};

export type ReadTraceSummary = {
  userId: string;
  traceId: string;
  nodeCount: number;
  edgeCount: number;
  minImportanceLevel: number;
  maxImportanceLevel: number;
  startedAt: number;
  endedAt: number | null;
  materializedAt: number;

  // Named diagnostic counts
  diagMissingStarts: number;
  diagMissingEnds: number;
  diagNegativeDurations: number;
  diagCycles: number;
  diagOrphanEdges: number;
  diagInvalidImportance: number;
  diagClockSkew: number;
};

export type ReadCheckpoint = {
  userId: string;
  traceId: string;

  // Exact raw node progress
  lastNodeEventTime: number;
  lastNodeEventId: string;
  lastNodeEventType: number;

  // Exact raw edge progress
  lastEdgeEventTime: number;
  lastEdgeEventId: string;
  lastEdgeEventType: number;

  checkpointedAt: number;
};

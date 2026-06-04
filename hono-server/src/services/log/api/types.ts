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
  data: Record<string, string>;
  startedAt: number;
  endedAt?: number;
  startMessage?: string;
  endMessage?: string;
};

export type ReadEdge = {
  id: string;
  userId: string;
  traceId: string;
  startedAt: number;
  endedAt?: number;
};

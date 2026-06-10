export type IngestNodeStart = {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startMessage?: string;
  startedAt: number;
  importanceLevel: number;
};

export type IngestNodeEnd = {
  id: string;
  traceId: string;
  endedAt: number;
  endMessage?: string;
};

export type IngestEdgeStart = {
  id: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  data: Record<string, string>;
  startedAt: number;
};

export type IngestEdgeEnd = {
  id: string;
  traceId: string;
  endedAt: number;
};

export type TracerConfig = {
  endpoint: string;
  apiKey: string;
  userId: string;
  batchSize?: number;
  flushInterval?: number;
  onDrop?: (error: Error, data: any) => void;
};

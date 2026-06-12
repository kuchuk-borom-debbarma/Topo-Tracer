export interface TracerConfig {
  endpoint: string;
  apiKey: string;
  userId?: string;
  serviceName?: string;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  onDrop?: (events: IngestBatch, reason: string) => void;
}

export interface IngestTraceStart {
  traceId: string;
  name?: string;
  importanceLabels?: Record<number, string>;
  timestamp: number;
}

export interface IngestNodeStart {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startMessage: string;
  startedAt: number;
  importanceLevel: number;
}

export interface IngestNodeEnd {
  id: string;
  traceId: string;
  endedAt: number;
  endMessage?: string;
}

export interface IngestEdgeStart {
  id: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  data: Record<string, string>;
  startedAt: number;
}

export interface IngestEdgeEnd {
  id: string;
  traceId: string;
  endedAt: number;
}

export interface IngestBatch {
  traceStarts: IngestTraceStart[];
  nodeStarts: IngestNodeStart[];
  edgeStarts: IngestEdgeStart[];
  nodeEnds: IngestNodeEnd[];
  edgeEnds: IngestEdgeEnd[];
}

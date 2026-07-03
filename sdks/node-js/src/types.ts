import type { Span } from "./Span";

export enum NodeType {
  CONTROLLER = "controller",
  DB_CALL = "db-call",
  REMOTE_CALL = "remote-call",
  IO = "io",
  METHOD = "method",
}

export enum Importance {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  DYNAMIC = -1,
}

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
  nodeTypeImportanceMapping?: Record<string, number>;
  ignoreFailures?: boolean;
  logHooks?: ((message: string, data?: Record<string, string>, importanceLevel?: number) => void)[];
  traceHooks?: {
    onSpanStart?: (span: Span) => void;
    onSpanEnd?: (span: Span) => void;
  }[];
}

export interface GroupLayer {
  key: string;
  label: string;
  order: number;
}

export interface GroupLayerInput {
  key: string;
  label?: string;
  order: number;
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
  name?: string; // Human-friendly code artifact identifier (e.g. "AuthController.login")
  groupParentId?: string | null;
  layer?: GroupLayer | null;
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

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
  data?: Record<string, unknown>;
};

export type TracerConfig = {
  baseUrl: string;
  batchSize?: number;
  flushIntervalMs?: number;
};

export type NodeConfig = {
  depth?: number;
  data?: Record<string, unknown>;
};

export type EdgeConfig = {
  label: string;
  data?: Record<string, unknown>;
  endImmediately?: boolean;
};

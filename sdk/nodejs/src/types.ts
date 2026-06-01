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
  metadata?: Record<string, unknown>;
};

export interface TracerConfig {
  baseUrl: string;
  batchSize?: number;
  flushIntervalMs?: number;
  containerId?: string;
  containerName?: string;
  containerKind?: string;
}

export interface NodeConfig {
  containerId?: string;
  parentId?: string | null;
  kind?: string;
  status?: "ok" | "error" | "warning" | "open";
  metadata?: Record<string, unknown>;
}

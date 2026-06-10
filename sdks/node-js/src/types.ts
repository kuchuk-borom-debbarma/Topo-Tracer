/**
 * Raw Node Start event shape for telemetry ingestion.
 */
export type IngestNodeStart = {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
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
 * Importance levels for telemetry events.
 */
export enum ImportanceLevel {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/**
 * Configuration for the Tracer.
 */
export type TracerConfig = {
  collectorUrl: string;
  serviceName: string;
  batchIntervalMs: number;
  maxQueueSize: number;
};

/**
 * Interface for exporting telemetry events.
 */
export interface ITelemetryExporter {
  export(event: IngestNodeStart | IngestNodeEnd | IngestEdgeStart | IngestEdgeEnd): void;
  flush(): Promise<void>;
}

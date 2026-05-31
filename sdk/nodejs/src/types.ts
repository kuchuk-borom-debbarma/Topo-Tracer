export const Level = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
} as const;

export type TraceSpanInput = {
  id: string;
  traceId: string;
  name: string;
  groupName: string;
  level: number;
  tags: Record<string, string>;
  eventType: "started" | "ended";
  timestamp: number; // UNIX timestamp in ms
};

export type TraceEdgeInput = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  timestamp: number; // UNIX timestamp in ms
};

export interface TracerConfig {
  /**
   * The base URL of the carno.js backend, e.g. "http://localhost:3000"
   */
  baseUrl: string;
  
  /**
   * The maximum number of items to keep in memory before flushing.
   * Default: 100
   */
  batchSize?: number;

  /**
   * The interval in milliseconds to periodically flush data.
   * Default: 2000
   */
  flushIntervalMs?: number;
}

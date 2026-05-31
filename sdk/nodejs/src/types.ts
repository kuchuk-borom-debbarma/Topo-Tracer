export type TraceSpanInput = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: "boundary" | "execution";
  type: string;
  tags: Record<string, string>;
  eventType: "started" | "ended";
  timestamp: number; // UNIX timestamp in ms
  levelNames?: Record<number, string>;
  viewLevel?: number;
};

export type TraceEdgeInput = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  type: string;
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

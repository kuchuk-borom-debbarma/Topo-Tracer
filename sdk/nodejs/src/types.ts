export type ContainerInput = {
  id: string;
  name: string;
  containerType: string;
  createdAtLocal: Date;
};

export type NodeInput = {
  id: string;
  traceId: string;
  containerId: string;
  parentNodeId?: string;
  name: string;
  nodeType: string;
  depthIndex: number;
  localDepthIndex: number;
  group?: string;
  metadata?: any;

  initiatedAtLocal: Date;
  processedAtLocal: Date;
  completedAtLocal?: Date;
  ancestryPath?: string[];
};

export type EdgeInput = {
  id: string;
  traceId: string;
  fromContainerId: string;
  toContainerId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  dispatchedAtLocal: Date;
  respondedAtLocal?: Date;
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

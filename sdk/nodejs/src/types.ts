export enum ContainerType {
  EXPRESS_API = 'Express API',
  GRPC_SERVICE = 'gRPC/HTTP Service',
  BACKGROUND_WORKER = 'Background Worker',
  CRON_JOB = 'Cron Job',
  POD = 'pod',
  DEPLOYMENT = 'deployment',
  SERVICE = 'service'
}

export enum NodeType {
  HTTP_SERVER = 'http_server',
  HTTP_CLIENT = 'http_client',
  DATABASE = 'database',
  MESSAGE_PRODUCER = 'message_producer',
  MESSAGE_CONSUMER = 'message_consumer',
  BATCH_JOB = 'batch_job',
  FUNCTION = 'function'
}

export enum EdgeType {
  HTTP_REQUEST = 'http_request',
  KAFKA_MESSAGE = 'kafka_message',
  SQS_MESSAGE = 'sqs_message'
}

export type ContainerInput = {
  id: string;
  name: string;
  containerType: ContainerType | string;
  createdAtLocal: Date;
};

export type NodeInput = {
  id: string;
  traceId: string;
  containerId: string;
  parentNodeId?: string;
  name: string;
  nodeType: NodeType | string;
  depthIndex: number;
  localDepthIndex: number;
  group?: string;
  metadata?: any;

  initiatedAtLocal: Date;
  processedAtLocal: Date;
  completedAtLocal?: Date;
  ancestryPath?: string[];
  scheduledAtLocal?: Date;
  cpuActiveDurationUs?: number;
  suspendedAtLocal?: Date[];
  resumedAtLocal?: Date[];
};

export type EdgeInput = {
  id: string;
  traceId: string;
  fromContainerId: string;
  toContainerId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: EdgeType | string;
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

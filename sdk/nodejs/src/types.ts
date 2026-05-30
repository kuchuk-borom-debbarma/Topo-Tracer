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

export type TraceContainerInput = {
  id: string;
  traceId: string;
  parentContainerId: string | null;
  name: string;
  type: string;
  tags: string[];
  eventType: "started" | "ended";
  timestamp: number; // in milliseconds
};

export type TraceNodeInput = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  tags: string[];
  eventType: "started" | "ended";
  timestamp: number; // in milliseconds
  metadata?: any;
};

export type TraceEdgeInput = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toId: string;
  toType: "node" | "container";
  type: string;
  timestamp: number; // in milliseconds
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

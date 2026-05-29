export type JsonValue = unknown;

export type TraceContainer = {
  id: string;
  traceId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
  createdAtLocal: Date;
  createdAtRemote: Date;
};

export type TraceBlock = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
};

export type TraceNode = {
  id: string;
  traceId: string;
  blockId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
  startedAtLocal: Date;
  endedAtLocal?: Date;
};

export type TraceEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  metadata?: JsonValue;
  requestedAtLocal: Date;
  respondedAtLocal?: Date;
};

export type TraceContainerInput = Omit<TraceContainer, "createdAtRemote">;
export type TraceBlockInput = TraceBlock;
export type TraceNodeInput = TraceNode;
export type TraceEdgeInput = TraceEdge;

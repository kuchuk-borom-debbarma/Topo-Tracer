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
  eventType: "started" | "ended";
  eventAtLocal: Date;
  ingestedAtRemote: Date;
};

export type TraceEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  metadata?: JsonValue;
  eventType: "requested" | "responded";
  eventAtLocal: Date;
  ingestedAtRemote: Date;
};

export type TraceContainerInput = Omit<TraceContainer, "createdAtRemote">;
export type TraceBlockInput = TraceBlock;
export type TraceNodeInput = Omit<TraceNode, "ingestedAtRemote">;
export type TraceEdgeInput = Omit<TraceEdge, "ingestedAtRemote">;

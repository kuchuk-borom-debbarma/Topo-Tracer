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

export type ReadBlock = {
  id: string;
  traceId: string;
  containerId: string;
  parentBlockId: string;
  callingNodeId: string;
  name: string;
  type: string;
  absoluteDepth: number;
  startTimeUs: number;
  durationUs: number | null;
  metadata?: JsonValue;
};

export type ReadNode = {
  id: string;
  traceId: string;
  blockId: string;
  name: string;
  type: string;
  zoomLevel: number;
  localSequence: number;
  startTimeUs: number;
  durationUs: number | null;
  metadata?: JsonValue;
};

export type ReadEdge = {
  id: string;
  edgeId: string;
  traceId: string;
  fromBlockId: string;
  fromNodeId: string;
  toBlockId: string;
  toNodeId: string;
};

export type TraceMetadata = {
  traceId: string;
  isZoomReady: boolean;
  maxAvailableDepth: number;
  materializedOffset: number;
};


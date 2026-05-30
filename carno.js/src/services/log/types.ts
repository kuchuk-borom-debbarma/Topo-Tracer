export type JsonValue = unknown;

export type TraceContainer = {
  id: string;
  traceId: string;
  parentContainerId: string | null;
  name: string;
  type: string;
  tags: string[];
  eventType: "started" | "ended";
  timestamp: Date;
  createdAtRemote?: Date;
};

export type TraceNode = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  tags: string[];
  eventType: "started" | "ended";
  timestamp: Date;
  metadata?: JsonValue;
  ingestedAtRemote?: Date;
};

export type TraceEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  timestamp: Date;
};

export type TraceContainerInput = {
  id: string;
  traceId: string;
  parentContainerId: string | null;
  name: string;
  type: string;
  tags: string[];
  eventType: "started" | "ended";
  timestamp: number; // UNIX timestamp in ms
};

export type TraceNodeInput = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  tags: string[];
  eventType: "started" | "ended";
  timestamp: number; // UNIX timestamp in ms
  metadata?: JsonValue;
};

export type TraceEdgeInput = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  timestamp: number; // UNIX timestamp in ms
};

export type ReadContainer = {
  id: string;
  traceId: string;
  parentContainerId: string | null;
  name: string;
  type: string;
  tags: string[];
  parentage: string[];
  startTimeUs: number;
  durationUs: number | null;
  metadata?: JsonValue;
};

export type ReadNode = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  tags: string[];
  parentage: string[]; // Hierarchical lineage: [parent_container_ids..., parent_node_id]
  localSequence: number; // Chronological sequence index inside the container
  startTimeUs: number;
  durationUs: number | null;
  metadata?: JsonValue;
};

export type ReadEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  distance: number;
  metadata?: JsonValue;
};

export type TraceMetadata = {
  traceId: string;
  isZoomReady: boolean;
  maxAvailableDepth: number;
  materializedOffset: number;
};

export type TraceListItem = {
  traceId: string;
  isZoomReady: boolean;
  createdAt: number;
  containerNames: string[];
  tags: string[];
};

export type TraceListResponse = {
  traces: TraceListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type TraceLayoutResponse = {
  metadata: {
    traceId: string;
    isZoomReady: boolean;
    tags: string[];
  };
  containers: Omit<ReadContainer, "parentage">[];
  nodes: Omit<ReadNode, "parentage">[];
  edges: ReadEdge[];
};

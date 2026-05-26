export type Container = {
  id: string;
  name: string;
  containerType: string; //The type of the container (e.g. "pod", "deployment", "service")

  createdAtLocal: Date; // The time on the local machine where it was created UTC milisecond
  createdAtRemote: Date; // The time on the remote machine where it was stored in database UTC milisecond
};

export type Node = {
  id: string;
  traceId: string; // The parent trace group ID
  containerId: string;
  parentNodeId: string; // Direct parent node ID (empty string if root)
  name: string;
  nodeType: string;
  depthIndex: number;
  metadata: any;
  initiatedAtLocal: Date;
  processedAtLocal: Date;
  completedAtLocal?: Date;
  ancestryPath?: string[]; // Pre-computed call stack path from root: ['node_root', ..., 'node_self']
};

export type Edge = {
  id: string;
  traceId: string; // The parent trace group ID
  fromContainerId: string;
  toContainerId: string;

  fromNodeId: string;
  toNodeId: string;

  edgeType: string;

  dispatchedAtLocal: Date; //when it made the connection, eg:- when it called the other container
  respondedAtLocal?: Date; //when it received the response from the other container
  egressAncestryPath?: string[]; // Pre-computed ancestry path of the originating node
};

export type ContainerInput = Omit<Container, "createdAtRemote">;

export type NodeInput = {
  id: string;
  traceId: string; // The parent trace group ID
  containerId: string;
  parentNodeId?: string; // Optional direct parent ID
  name: string;
  nodeType: string;
  depthIndex: number;
  metadata?: any;
  initiatedAtLocal: Date;
  processedAtLocal: Date;
  completedAtLocal?: Date;
  ancestryPath?: string[];
};

export type EdgeInput = Edge;

export interface PaginationParams {
  limit?: number;
  beforeTime?: number;
  beforeId?: string;
  afterTime?: number;
  afterId?: string;
  depth?: number; // Target visual zoom depth index
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    prevTimeCursor: number | null;
    prevIdCursor: string | null;
    nextTimeCursor: number | null;
    nextIdCursor: string | null;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export interface VisualWire {
  id: string;
  fromTarget: { id: string; type: "node" | "container" };
  toTarget: { id: string; type: "node" | "container" };
}

export interface PaginatedTraceResult {
  nodes: Node[];
  edges: Edge[];
  visualWires?: VisualWire[]; // Snapped coordinates matching zoom depth
  isZoomReady: boolean;        // True if read_edges are fully pre-computed
  maxAvailableDepth: number;   // Maximum stack depth index in this trace
  pagination: {
    prevTimeCursor: number | null;
    prevIdCursor: string | null;
    nextTimeCursor: number | null;
    nextIdCursor: string | null;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export interface TraceMetadataResult {
  isZoomReady: boolean;
  maxAvailableDepth: number;
}

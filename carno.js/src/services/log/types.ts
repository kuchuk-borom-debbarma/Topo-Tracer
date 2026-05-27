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
  name: string;             // Human readable name (e.g., 'POST /checkout', 'Process Payment')
  nodeType: string;         // Categorization (e.g., 'http_route', 'db_query', 'function')
  depthIndex: number;       // The structural nesting level from the trace root. Used heavily for zoom filtering.
  localDepthIndex: number;  // The structural nesting level within the specific container.
  metadata: any;            // Custom baggage properties attached to the execution block
  initiatedAtLocal: Date;   // When this execution block began
  processedAtLocal: Date;   // When the logic finished executing
  completedAtLocal?: Date;  // When all async child blocks finally resolved
  
  // Ordered path of parent Node IDs from the root down to this node.
  // Crucial for instantly collapsing nested function calls into their highest visible parent container.
  ancestryPath?: string[]; 
};

export type Edge = {
  id: string;
  traceId: string; // The parent trace group ID
  fromContainerId: string;
  toContainerId: string;

  fromNodeId: string;
  toNodeId: string;

  edgeType: string;

  dispatchedAtLocal: Date; // Timestamp when the cross-boundary call was initiated (e.g. HTTP POST sent)
  respondedAtLocal?: Date; // Timestamp when the response was received back (for synchronous edges)
  
  // Pre-computed array of parent node IDs for the 'fromNodeId'. 
  // Used by the backend to quickly determine what visible parent to snap to when zooming out.
  egressAncestryPath?: string[]; 
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
  localDepthIndex: number;
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
  depthType?: 'global' | 'local'; // Zoom mode
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
  id: string; // Composite ID mapping to the raw edge and the visual depth

  // The origin of the network hop, dynamically collapsed to a parent node or container
  // if the true egress node is hidden by the current zoom depth.
  fromTarget: { id: string; type: "node" | "container" };

  // The destination of the network hop, dynamically collapsed to a parent node or container
  // if the true ingress node is hidden by the current zoom depth.
  toTarget: { id: string; type: "node" | "container" };
}

export interface PaginatedTraceResult {
  nodes: Node[];
  edges: Edge[];
  visualWires?: VisualWire[]; // Snapped coordinates matching zoom depth
  isZoomReady: boolean;        // True if read_edges are fully pre-computed
  maxAvailableDepth: number;   // Maximum stack depth index in this trace
  maxAvailableLocalDepth: number; // Maximum local stack depth in this trace
  pagination: {
    prevTimeCursor: number | null;
    prevIdCursor: string | null;
    nextTimeCursor: number | null;
    nextIdCursor: string | null;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export interface FullTraceResult {
  nodes: Node[];
  edges: Edge[];
  visualWires?: VisualWire[]; // Snapped coordinates matching zoom depth
  isZoomReady: boolean;        // True if read_edges are fully pre-computed
  maxAvailableDepth: number;   // Maximum stack depth index in this trace
  maxAvailableLocalDepth: number; // Maximum local stack depth in this trace
}

export interface TraceMetadataResult {
  isZoomReady: boolean;
  maxAvailableDepth: number;
  maxAvailableLocalDepth: number;
}

export interface NodeMaterializationDTO {
  id: string;
  parentNodeId: string;
  depthIndex: number;
  localDepthIndex: number;
}

export interface EdgeMaterializationDTO {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromContainerId: string;
  toContainerId: string;
}

export interface NodeAncestryRecord {
  node_id: string;
  ancestryPath: string[]; // Ordered list of node IDs from root to this node (inclusive)
  ancestryDepths: number[]; // Parallel array mapping to ancestryPath indices, storing their absolute depthIndex
  ancestryLocalDepths: number[]; // Parallel array mapping to local depth indexes
}

export interface EdgeEgressAncestryRecord {
  edge_id: string;
  egressAncestryPath: string[]; // Ordered list of node IDs from root to the egress node
  egressAncestryDepths: number[]; // Parallel array storing the depthIndex of each node
  egressAncestryLocalDepths: number[]; // Parallel array storing the local depthIndex
}

export interface TraceMetadataUpdate {
  max_available_depth?: number;
  max_available_local_depth?: number;
  is_zoom_ready?: boolean;
}

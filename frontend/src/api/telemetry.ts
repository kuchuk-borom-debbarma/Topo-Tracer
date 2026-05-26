export type ContainerType = "pod" | "lambda" | "process" | "browser";

export interface TraceContainer {
  id: string;
  name: string;
  containerType: ContainerType;
}

export interface TraceNode {
  id: string;
  traceId: string;
  containerId: string;
  parentNodeId?: string;
  depthIndex: number;
  nodeType: string;
  name: string;
  metadata: string;
  initiatedAtLocal: string | number;
  processedAtLocal: string | number;
  completedAtLocal?: string | number;
}

export interface TraceEdge {
  id: string;
  traceId: string;
  fromContainerId: string;
  toContainerId: string;
  fromNodeId: string;
  toNodeId: string;
  egressAncestryPath: string[];
  edgeType: string;
  dispatchedAtLocal: string | number;
  respondedAtLocal?: string | number;
}

export interface TraceData {
  traceId: string;
  containers: TraceContainer[];
  nodes: TraceNode[];
  edges: TraceEdge[];
  maxDepth: number;
  hasMore: boolean;
}

export interface TraceMetadata {
  traceId: string;
  isZoomReady: boolean;
  maxAvailableDepth: number;
  containerIds: string[];
}

const API_BASE = "http://localhost:3000/telemetry";

export const telemetryApi = {
  getTrace: async (traceId: string, depth?: number): Promise<TraceData> => {
    const url = new URL(`${API_BASE}/trace/${traceId}`);
    url.searchParams.set("limit", "1000"); // for now, fetch up to 1000 items
    if (depth !== undefined) {
      url.searchParams.set("depth", depth.toString());
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Failed to fetch trace");
    return res.json();
  },

  getTraceMetadata: async (traceId: string): Promise<TraceMetadata> => {
    const res = await fetch(`${API_BASE}/trace/${traceId}/metadata`);
    if (!res.ok) throw new Error("Failed to fetch trace metadata");
    return res.json();
  }
};

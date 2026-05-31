export type JsonValue = unknown;

export type TraceSpanInput = {
  id: string;
  traceId: string;
  name: string;
  groupName: string;
  level: number;
  tags: Record<string, string>;
  eventType: "started" | "ended";
  timestamp: number; // UNIX timestamp in ms
};

export type TraceEdgeInput = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  timestamp: number; // UNIX timestamp in ms
};

export type ReadSpan = {
  id: string;
  traceId: string;
  name: string;
  groupName: string;
  level: number;
  tags: Record<string, string>;
  startTimeUs: number;
  endTimeUs: number | null;
  durationUs: number | null;
  ancestryPath: string[];
};

export type ReadEdge = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
};

export type TraceListItem = {
  traceId: string;
  createdAt: number;
  spanCount: number;
};

export type TraceListResponse = {
  traces: TraceListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type LayoutEdge = ReadEdge & {
  isGhost?: boolean;
  ghostCount?: number;
};

export type TraceLayoutResponse = {
  metadata: {
    traceId: string;
  };
  spans: ReadSpan[];
  edges: LayoutEdge[];
};

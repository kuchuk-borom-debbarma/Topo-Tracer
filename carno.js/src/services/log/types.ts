export type JsonValue = unknown;

export type TraceSpan = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: "boundary" | "execution";
  type: string;
  tags: Record<string, string>;
  eventType: "started" | "ended";
  timestamp: Date;
  levelNames?: Record<number, string>;
  viewLevel?: number;
};

export type TraceSpanInput = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: "boundary" | "execution";
  type: string;
  tags: Record<string, string>;
  eventType: "started" | "ended";
  timestamp: number; // UNIX timestamp in ms
  levelNames?: Record<number, string>;
  viewLevel?: number;
};

export type TraceEdge = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  type: string;
  timestamp: Date;
};

export type TraceEdgeInput = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  type: string;
  timestamp: number; // UNIX timestamp in ms
};

export type ReadSpan = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: "boundary" | "execution";
  type: string;
  tags: Record<string, string>;
  parentage: string[];
  viewLevel: number;
  localSequence: number;
  startTimeUs: number;
  durationUs: number | null;
  metadata?: any;
};

export type ReadEdge = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  type: string;
  distance: number;
  metadata?: any;
};

export type GhostSpan = {
  id: string;
  fromSpanId: string;
  toSpanId: string;
  hiddenCount: number;
  truncatedLineage: string[];
  durationUs: number;
  startTimeUs: number;
  endTimeUs: number;
};

export type TraceListItem = {
  traceId: string;
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
    levelNames: Record<number, string>;
  };
  spans: ReadSpan[];
  edges: ReadEdge[];
  ghostSpans: GhostSpan[];
};

const API_BASE = 'http://localhost:3000/telemetry';

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

export type LayoutEdge = {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  isGhost?: boolean;
  ghostCount?: number;
};

export type TraceLayoutResponse = {
  metadata: { traceId: string };
  spans: ReadSpan[];
  edges: LayoutEdge[];
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

export const fetchTraces = async (): Promise<TraceListResponse> => {
  const res = await fetch(`${API_BASE}/traces`);
  if (!res.ok) throw new Error('Failed to fetch traces');
  return res.json();
};

export const fetchTraceLayout = async (traceId: string, maxLevel?: number): Promise<TraceLayoutResponse> => {
  const url = new URL(`${API_BASE}/trace/${traceId}`);
  if (maxLevel !== undefined) {
    url.searchParams.set('maxLevel', maxLevel.toString());
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    if (res.status === 404) throw new Error('Trace not found or not fully processed');
    throw new Error('Failed to fetch trace layout');
  }
  
  // Note: res might be empty (null returned by backend)
  const text = await res.text();
  if (!text) throw new Error('Trace not found or not fully processed');
  
  return JSON.parse(text);
};

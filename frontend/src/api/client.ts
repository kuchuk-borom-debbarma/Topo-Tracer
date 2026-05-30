// ============================================================
// API Types — mirrors carno.js backend types
// ============================================================

export type TraceListItem = {
  traceId: string;
  isZoomReady: boolean;
  maxAvailableDepth: number;
  createdAt: number;
  containerNames: string[];
};

export type TraceListResponse = {
  traces: TraceListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

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
  ancestryPath: string[];
  metadata?: unknown;
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
  ancestryPath: string[];
  metadata?: unknown;
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

export type TraceLayoutResponse = {
  metadata: {
    traceId: string;
    isZoomReady: boolean;
    maxAvailableDepth: number;
    currentDepth: number;
  };
  blocks: ReadBlock[];
  nodes: ReadNode[];
  edges: ReadEdge[];
};

// ============================================================
// API Client
// ============================================================

const SETTINGS_KEY = "topo_tracer_api_url";

export function getApiBaseUrl(): string {
  return localStorage.getItem(SETTINGS_KEY) || "http://localhost:3000";
}

export function setApiBaseUrl(url: string): void {
  localStorage.setItem(SETTINGS_KEY, url.replace(/\/$/, ""));
}

async function apiFetch<T>(path: string): Promise<T> {
  const base = getApiBaseUrl();
  // If same origin (proxy), use relative; else use absolute
  const url = base === "http://localhost:3000"
    ? path  // use Vite dev proxy
    : `${base}${path}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Query key factories ─────────────────────────────────────
export const queryKeys = {
  tracesList: (page: number, limit: number) => ["traces", "list", page, limit] as const,
  traceLayout: (traceId: string, zoomLevel: number) => ["trace", "layout", traceId, zoomLevel] as const,
};

// ── Fetch functions ─────────────────────────────────────────
export async function fetchTracesList(page: number, limit: number): Promise<TraceListResponse> {
  return apiFetch(`/telemetry/traces?page=${page}&limit=${limit}`);
}

export async function fetchTraceLayout(
  traceId: string,
  zoomLevel: number
): Promise<TraceLayoutResponse> {
  return apiFetch(`/telemetry/trace/${encodeURIComponent(traceId)}?zoom_level=${zoomLevel}`);
}

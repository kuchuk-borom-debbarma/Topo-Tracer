// ============================================================
// API Types — mirrors carno.js backend types
// ============================================================

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

export type ReadContainer = {
  id: string;
  traceId: string;
  parentContainerId: string | null;
  name: string;
  type: string;
  tags: string[];
  startTimeUs: number;
  durationUs: number | null;
  metadata?: any;
};

export type ReadNode = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  tags: string[];
  localSequence: number;
  startTimeUs: number;
  durationUs: number | null;
  metadata?: any;
};

export type ReadEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toId: string;
  toType: "node" | "container";
  type: string;
  distance: number;
  metadata?: any;
};

export type TraceLayoutResponse = {
  metadata: {
    traceId: string;
    isZoomReady: boolean;
    tags: string[];
  };
  containers: ReadContainer[];
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
  traceLayout: (traceId: string, tags?: string[]) => ["trace", "layout", traceId, tags ? tags.join(",") : ""] as const,
};

// ── Fetch functions ─────────────────────────────────────────
export async function fetchTracesList(page: number, limit: number): Promise<TraceListResponse> {
  return apiFetch(`/telemetry/traces?page=${page}&limit=${limit}`);
}

export async function fetchTraceLayout(
  traceId: string,
  tags?: string[]
): Promise<TraceLayoutResponse> {
  const query = tags && tags.length > 0 ? `?tags=${encodeURIComponent(tags.join(","))}` : "";
  return apiFetch(`/telemetry/trace/${encodeURIComponent(traceId)}${query}`);
}

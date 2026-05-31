// ============================================================
// V4 API Types — mirrors carno.js backend types
// ============================================================

export type TraceListItem = {
  traceId: string;
  isZoomReady: boolean;
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

export type ReadSpan = {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: "boundary" | "execution";
  type: string;
  parentage: string[];
  viewLevel: number;
  localSequence: number;
  startTimeUs: number;
  durationUs: number | null;
  metadata?: any;
};

export type ReadEdgeRaw = {
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

export type ReadContainer = {
  id: string;
  traceId: string;
  parentContainerId: string | null;
  name: string;
  type: string;
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
    levelNames: Record<number, string>;
    maxLevel: number;
  };
  containers: ReadContainer[];
  nodes: ReadNode[];
  edges: ReadEdge[];
  ghostSpans: GhostSpan[];
};

// ============================================================
// API Client Configuration
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
  traceLayout: (traceId: string, maxLevel?: number) => ["trace", "layout", traceId, maxLevel !== undefined ? maxLevel : ""] as const,
};

// ── Fetch functions ─────────────────────────────────────────
export async function fetchTracesList(page: number, limit: number): Promise<TraceListResponse> {
  const res = await apiFetch<any>(`/telemetry/traces?page=${page}&limit=${limit}`);
  return {
    ...res,
    traces: (res.traces || []).map((t: any) => ({
      ...t,
      isZoomReady: true
    }))
  };
}

export async function fetchTraceLayout(
  traceId: string,
  maxLevel?: number
): Promise<TraceLayoutResponse> {
  const query = maxLevel !== undefined ? `?maxLevel=${maxLevel}` : "";
  const res = await apiFetch<any>(`/telemetry/trace/${encodeURIComponent(traceId)}${query}`);
  
  const spans: ReadSpan[] = res.spans || [];
  const edges: ReadEdgeRaw[] = res.edges || [];
  const ghostSpans: GhostSpan[] = res.ghostSpans || [];

  // Unified-Span to Container-Node Adapter logic
  const getEnclosingContainerId = (span: any) => {
    const parentage = span.parentage || [];
    for (const id of [...parentage].reverse()) {
      if (id === span.id) continue;
      const parent = spans.find(x => x.id === id);
      if (parent && parent.kind === "boundary") {
        return parent.id;
      }
    }
    return span.parentId || "";
  };

  const containers: ReadContainer[] = spans
    .filter((s: any) => s.kind === "boundary")
    .map((s: any) => ({
      id: s.id,
      traceId: s.traceId,
      parentContainerId: s.parentId,
      name: s.name,
      type: s.type,
      startTimeUs: s.startTimeUs,
      durationUs: s.durationUs,
      metadata: s.metadata
    }));

  const nodes: ReadNode[] = spans
    .filter((s: any) => s.kind === "execution")
    .map((s: any) => ({
      id: s.id,
      traceId: s.traceId,
      containerId: getEnclosingContainerId(s),
      name: s.name,
      type: s.type,
      localSequence: s.localSequence,
      startTimeUs: s.startTimeUs,
      durationUs: s.durationUs,
      metadata: s.metadata
    }));

  const mappedEdges: ReadEdge[] = edges.map((e: any) => {
    const toSpan = spans.find(x => x.id === e.toSpanId);
    const resolvedToType = toSpan && toSpan.kind === "boundary" ? "container" : "node";
    return {
      id: e.id,
      traceId: e.traceId,
      fromNodeId: e.fromSpanId,
      toId: e.toSpanId,
      toType: resolvedToType,
      type: e.type,
      distance: e.distance,
      metadata: e.metadata
    };
  });

  return {
    metadata: {
      traceId: res.metadata.traceId,
      levelNames: res.metadata.levelNames || {},
      maxLevel: Number(res.metadata.maxLevel ?? 0),
    },
    containers,
    nodes,
    edges: mappedEdges,
    ghostSpans,
  };
}

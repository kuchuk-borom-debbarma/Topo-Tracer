import type { FlowWindowResponse, TraceListResponse, TraceSummary } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export async function fetchTraces(page = 1, limit = 20): Promise<TraceListResponse> {
  return getJson(`/telemetry/traces?page=${page}&limit=${limit}`);
}

export async function fetchTraceSummary(traceId: string): Promise<TraceSummary | null> {
  return getJson(`/telemetry/traces/${traceId}/summary`);
}

export async function fetchFlowWindow(input: {
  traceId: string;
  cursor?: string | null;
  anchorId?: string | null;
  expandedIds?: string[];
  detailBudget?: number;
}): Promise<FlowWindowResponse | null> {
  const params = new URLSearchParams();
  params.set("detailBudget", String(input.detailBudget ?? 250));
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.anchorId) params.set("anchorId", input.anchorId);
  if (input.expandedIds?.length) params.set("expandedIds", input.expandedIds.join(","));
  return getJson(`/telemetry/traces/${input.traceId}/flow-window?${params.toString()}`);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

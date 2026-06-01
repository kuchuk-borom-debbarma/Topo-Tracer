import type { GraphWindowResponse, TraceListResponse, TraceSummary } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3999";

export async function fetchTraces(page = 1, limit = 20): Promise<TraceListResponse> {
  return getJson(`/telemetry/traces?page=${page}&limit=${limit}`);
}

export async function fetchTraceSummary(traceId: string): Promise<TraceSummary | null> {
  return getJson(`/telemetry/traces/${traceId}/summary`);
}

export async function fetchGraph(input: {
  traceId: string;
  maxImportance: number;
  cursor?: string | null;
  limit?: number;
}): Promise<GraphWindowResponse | null> {
  const params = new URLSearchParams();
  params.set("maxImportance", String(input.maxImportance));
  params.set("limit", String(input.limit ?? 250));
  if (input.cursor) params.set("cursor", input.cursor);
  return getJson(`/telemetry/traces/${input.traceId}/graph?${params.toString()}`);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

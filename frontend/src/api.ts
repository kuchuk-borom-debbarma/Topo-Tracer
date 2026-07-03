import { clearToken, getToken } from "./auth";
import type {
  ProjectedFlowResult,
  ApiKey,
  CreatedApiKey,
  TraceListResult,
  TraceSummary,
  User,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const REQUEST_TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ token: string }> {
  return request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  }, false);
}

export async function startSignUp(input: {
  username: string;
  email: string;
  password: string;
}): Promise<{ token: string }> {
  return request("/api/v1/auth/signup/start", {
    method: "POST",
    body: JSON.stringify(input),
  }, false);
}

export async function finishSignUp(input: {
  token: string;
  otp: string;
}): Promise<{ success: boolean }> {
  return request("/api/v1/auth/signup/finish", {
    method: "POST",
    body: JSON.stringify(input),
  }, false);
}

export async function fetchCurrentUser(): Promise<{ user: User }> {
  return request("/api/v1/auth/me");
}

export async function fetchApiKeys(): Promise<{ apiKeys: ApiKey[] }> {
  return request("/api/v1/auth/api-keys");
}

export async function createApiKey(input: { name: string }): Promise<{ apiKey: CreatedApiKey }> {
  return request("/api/v1/auth/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeApiKey(apiKeyId: string): Promise<{ success: boolean }> {
  return request(`/api/v1/auth/api-keys/${encodeURIComponent(apiKeyId)}`, {
    method: "DELETE",
  });
}

export async function fetchTraces(input: {
  page: number;
  limit: number;
}): Promise<TraceListResult> {
  const params = new URLSearchParams({
    page: String(input.page),
    limit: String(input.limit),
  });
  return request(`/api/v1/traces?${params.toString()}`);
}

export async function fetchTraceSummary(traceId: string): Promise<TraceSummary> {
  return request(`/api/v1/traces/${encodeURIComponent(traceId)}/summary`);
}

export async function deleteTrace(traceId: string): Promise<{ accepted: boolean }> {
  return request(`/api/v1/traces/${encodeURIComponent(traceId)}`, {
    method: "DELETE",
  });
}

export async function fetchTraceFlow(input: {
  traceId: string;
  threshold: number;
  cursor?: string;
  limit?: number;
  collapsedGroups?: string[];
  collapsedLayers?: string[];
}): Promise<ProjectedFlowResult> {
  const params = new URLSearchParams({
    threshold: String(input.threshold),
    limit: String(input.limit ?? 160),
  });
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.collapsedGroups?.length) params.set("collapsedGroups", input.collapsedGroups.join(","));
  if (input.collapsedLayers?.length) params.set("collapsedLayers", input.collapsedLayers.join(","));
  return request(
    `/api/v1/traces/${encodeURIComponent(input.traceId)}/flow?${params.toString()}`,
  );
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 401 && authenticated) {
        clearToken();
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
      }
      throw new ApiError(payload.error ?? `Request failed with ${response.status}`, response.status);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The server took too long to respond.", 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

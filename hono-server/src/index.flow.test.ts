import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import app from "./index";
import { logService } from "./services/log";
import { authService } from "./services/auth";

describe("GET /api/v1/traces/:traceId/flow", () => {
  const mockUser = { id: "user-123", email: "user@test.com", username: "testuser" };
  let originalGetUserByToken: any;
  let originalProjectTraceFlow: any;

  beforeEach(() => {
    originalGetUserByToken = authService.getUserByToken;
    originalProjectTraceFlow = logService.projectTraceFlow;
  });

  afterEach(() => {
    authService.getUserByToken = originalGetUserByToken;
    logService.projectTraceFlow = originalProjectTraceFlow;
  });

  it("should return 401 when not authenticated", async () => {
    const res = await app.request("/api/v1/traces/trace-1/flow");
    expect(res.status).toBe(401);
  });

  it("should return 400 for invalid threshold", async () => {
    authService.getUserByToken = async () => mockUser as any;
    const res = await app.request("/api/v1/traces/trace-1/flow?threshold=-1", {
      headers: { Authorization: "Bearer token" }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid threshold");
  });

  it("should return 400 for invalid limit (too low)", async () => {
    authService.getUserByToken = async () => mockUser as any;
    const res = await app.request("/api/v1/traces/trace-1/flow?limit=0", {
      headers: { Authorization: "Bearer token" }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid limit");
  });

  it("should return 400 for invalid limit (too high)", async () => {
    authService.getUserByToken = async () => mockUser as any;
    const res = await app.request("/api/v1/traces/trace-1/flow?limit=1001", {
      headers: { Authorization: "Bearer token" }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid limit");
  });

  it("should call logService.projectTraceFlow with correct defaults", async () => {
    authService.getUserByToken = async () => mockUser as any;
    let capturedParams: any;
    logService.projectTraceFlow = async (params: any) => {
      capturedParams = params;
      return { nodes: [], edges: [], metadata: {} } as any;
    };

    const res = await app.request("/api/v1/traces/trace-123/flow", {
      headers: { Authorization: "Bearer token" }
    });

    expect(res.status).toBe(200);
    expect(capturedParams.userId).toBe("user-123");
    expect(capturedParams.traceId).toBe("trace-123");
    expect(capturedParams.threshold).toBe(0);
    expect(capturedParams.limit).toBe(1000);
  });

  it("should call logService.projectTraceFlow with provided params", async () => {
    authService.getUserByToken = async () => mockUser as any;
    let capturedParams: any;
    logService.projectTraceFlow = async (params: any) => {
      capturedParams = params;
      return { nodes: [], edges: [], metadata: {} } as any;
    };

    const res = await app.request("/api/v1/traces/trace-123/flow?threshold=5&limit=100&cursor=c123", {
      headers: { Authorization: "Bearer token" }
    });

    expect(res.status).toBe(200);
    expect(capturedParams.threshold).toBe(5);
    expect(capturedParams.limit).toBe(100);
    expect(capturedParams.cursor).toBe("c123");
  });
});

describe("GET /api/v1/traces", () => {
  const mockUser = { id: "user-123", email: "user@test.com", username: "testuser" };
  let originalGetUserByToken: any;
  let originalListTraces: any;

  beforeEach(() => {
    originalGetUserByToken = authService.getUserByToken;
    originalListTraces = logService.listTraces;
  });

  afterEach(() => {
    authService.getUserByToken = originalGetUserByToken;
    logService.listTraces = originalListTraces;
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/v1/traces");
    expect(res.status).toBe(401);
  });

  it("validates bounded paging parameters", async () => {
    authService.getUserByToken = async () => mockUser as any;

    const invalidPage = await app.request("/api/v1/traces?page=0", {
      headers: { Authorization: "Bearer token" },
    });
    const invalidLimit = await app.request("/api/v1/traces?limit=101", {
      headers: { Authorization: "Bearer token" },
    });

    expect(invalidPage.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
  });

  it("lists traces for the authenticated tenant", async () => {
    authService.getUserByToken = async () => mockUser as any;
    let capturedParams: any;
    logService.listTraces = async (params: any) => {
      capturedParams = params;
      return {
        traces: [],
        totalCount: 0,
        page: 2,
        limit: 15,
        totalPages: 0,
        hasPreviousPage: true,
        hasNextPage: false,
      };
    };

    const res = await app.request("/api/v1/traces?page=2&limit=15", {
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(200);
    expect(capturedParams).toEqual({
      userId: "user-123",
      page: 2,
      limit: 15,
    });
  });
});

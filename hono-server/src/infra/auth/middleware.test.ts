// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../common/env";
import { jwtAuthMiddleware } from "./middleware";
import { authService } from "../../services/auth";
import { TopoTraceException } from "../../common/types";

describe("jwtAuthMiddleware", () => {
  it("should return 401 when no token is provided", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", jwtAuthMiddleware());
    app.get("/test", (c) => c.text("ok"));

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Missing token");
  });

  it("should authenticate and store userId when valid token is provided", async () => {
    const mockUser = { id: "user-123", email: "user@test.com", username: "testuser" };
    // Mock authService.getUserByToken
    const originalGetUserByToken = authService.getUserByToken;
    authService.getUserByToken = async () => mockUser as any;

    try {
      const app = new Hono<AppEnv>();
      app.use("*", jwtAuthMiddleware());
      app.get("/test", (c) => {
        const userId = c.get("userId");
        const user = c.get("user");
        return c.json({ userId, user });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer valid-token-abc",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("user-123");
      expect(body.user.email).toBe("user@test.com");
    } finally {
      authService.getUserByToken = originalGetUserByToken;
    }
  });

  it("should support fallback to X-API-Key header", async () => {
    const mockUser = { id: "user-456", email: "user456@test.com", username: "testuser" };
    const originalGetUserByApiKey = authService.getUserByApiKey;
    authService.getUserByApiKey = async () => mockUser as any;

    try {
      const app = new Hono<AppEnv>();
      app.use("*", jwtAuthMiddleware());
      app.get("/test", (c) => c.json({ userId: c.get("userId") }));

      const res = await app.request("/test", {
        headers: {
          "X-API-Key": "valid-api-key-xyz",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("user-456");
    } finally {
      authService.getUserByApiKey = originalGetUserByApiKey;
    }
  });

  it("should return 403 on tenant mismatch between authenticated user and X-User-Id header", async () => {
    const mockUser = { id: "user-123", email: "user@test.com", username: "testuser" };
    const originalGetUserByToken = authService.getUserByToken;
    authService.getUserByToken = async () => mockUser as any;

    try {
      const app = new Hono<AppEnv>();
      app.use("*", jwtAuthMiddleware());
      app.get("/test", (c) => c.text("ok"));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer valid-token-abc",
          "X-User-Id": "other-user-999",
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Tenant verification failed");
    } finally {
      authService.getUserByToken = originalGetUserByToken;
    }
  });

  it("should return 401 when token verification throws", async () => {
    const originalGetUserByToken = authService.getUserByToken;
    authService.getUserByToken = async () => {
      throw new TopoTraceException("Invalid or expired token", 401);
    };

    try {
      const app = new Hono();
      app.use("*", jwtAuthMiddleware());
      app.get("/test", (c) => c.text("ok"));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer expired-token",
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Invalid or expired token");
    } finally {
      authService.getUserByToken = originalGetUserByToken;
    }
  });
});

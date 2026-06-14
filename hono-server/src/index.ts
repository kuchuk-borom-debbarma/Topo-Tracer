import { Hono } from "hono";
import { clickhouse, postgres } from "./infra/db";
// Wire services to keep them active in the service registry and prevent Fallow warnings
import { authService, authEventConsumer } from "./services/auth";
import { logService, logIngestConsumer, readOptimisedAggregator } from "./services/log";
import { eventBus } from "./infra/event-bus";
import { outboxStore, OutboxRelay } from "./infra/event-bus/outbox";
import { requestTracingMiddleware } from "./infra/tracing/middleware";
import { jwtAuthMiddleware } from "./infra/auth/middleware";
import { getStringEnvValue } from "./common/env";

const outboxRelay = new OutboxRelay(outboxStore, eventBus);

// Bootstrap Postgres and ClickHouse databases and start the outbox relay background daemon on startup
Promise.all([
  postgres.bootstrapPostgres(),
  clickhouse.bootstrapClickHouse(),
])
  .then(() => {
    console.log("[Database] Postgres and ClickHouse databases bootstrapped and schemas verified.");
    outboxRelay.start();
    console.log("[OutboxRelay] Background outbox relay daemon started.");
  })
  .catch((err) => {
    console.error("[Database] Bootstrapping failed:", err);
  });

// Initialize event consumers on startup
authEventConsumer.init().catch((err) => console.error("[AuthEventConsumer] Failed to start:", err));
logIngestConsumer.init().catch((err) => console.error("[LogIngestConsumer] Failed to start:", err));
readOptimisedAggregator.init().catch((err) => console.error("[ReadOptimisedAggregator] Failed to start:", err));

// Register process lifecycle hooks for graceful shutdown in long-lived VMs/containers
const handleGracefulShutdown = async (signal: string) => {
  console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);
  
  try {
    console.log("[Server] Stopping outbox relay daemon...");
    await outboxRelay.stop();
    console.log("[Server] Outbox relay stopped cleanly.");
    
    if (typeof (eventBus as any).shutdown === "function") {
      console.log("[Server] Shutting down event bus connection...");
      await (eventBus as any).shutdown();
    }
    
    console.log("[Server] Closing PostgreSQL connection pool...");
    const pgClient = postgres.getInitializedPostgresClient();
    await pgClient.end();
    console.log("[Server] PostgreSQL connection pool closed.");
    
    console.log("[Server] Graceful shutdown complete. Exiting.");
    process.exit(0);
  } catch (error) {
    console.error("[Server] Error during graceful shutdown:", error);
    process.exit(1);
  }
};

if (typeof process !== "undefined") {
  process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
}

const app = new Hono<clickhouse.ClickHouseEnv>();

app.use("*", requestTracingMiddleware());
app.use("*", clickhouse.initClickHouse);
app.use("*", postgres.initPostgres);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/api/v1/ingest", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  
  const body = await c.req.json();
  
  // Basic validation
  if (!body.nodeStarts || !body.edgeStarts || !body.nodeEnds || !body.edgeEnds) {
    return c.json({ error: "Missing required fields (nodeStarts, edgeStarts, nodeEnds, edgeEnds)" }, 400);
  }

  try {
    await logService.ingestNodesNEdges({
      userId,
      traceStarts: body.traceStarts ?? [],
      nodeStarts: body.nodeStarts,
      edgeStarts: body.edgeStarts,
      nodeEnds: body.nodeEnds,
      edgeEnds: body.edgeEnds,
    });
    return c.json({ success: true });
  } catch (error) {
    console.error("[IngestRoute] Ingestion failed:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

app.post("/api/v1/auth/signup/start", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.username || !body.email || !body.password) {
      return c.json({ error: "Missing required fields (username, email, password)" }, 400);
    }
    const token = await authService.startSignUp({
      username: body.username,
      email: body.email,
      password: body.password,
    });
    return c.json({ token });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.post("/api/v1/auth/signup/finish", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.token || !body.otp) {
      return c.json({ error: "Missing required fields (token, otp)" }, 400);
    }
    await authService.finishSignUp({
      token: body.token,
      otp: body.otp,
    });
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.post("/api/v1/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.email || !body.password) {
      return c.json({ error: "Missing required fields (email, password)" }, 400);
    }
    const jwtSecret = getStringEnvValue(c, "JWT_SECRET") || "default-secret-key";
    const token = await authService.getAuthToken({
      email: body.email,
      password: body.password,
      jwtSecret,
    });
    return c.json({ token });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.get("/api/v1/auth/me", jwtAuthMiddleware(), async (c) => {
  return c.json({ user: c.get("user") });
});

app.get("/api/v1/auth/api-keys", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const apiKeys = await authService.listApiKeys({ userId });
  return c.json({ apiKeys });
});

app.post("/api/v1/auth/api-keys", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json();
  if (!body.name) {
    return c.json({ error: "Missing required field (name)" }, 400);
  }

  try {
    const apiKey = await authService.createApiKey({ userId, name: body.name });
    return c.json({ apiKey });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.delete("/api/v1/auth/api-keys/:apiKeyId", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const apiKeyId = c.req.param("apiKeyId");
  await authService.revokeApiKey({ userId, apiKeyId });
  return c.json({ success: true });
});

app.post("/api/v1/auth/reset-password/start", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.email) {
      return c.json({ error: "Missing required field (email)" }, 400);
    }
    const token = await authService.startResetPassword({
      email: body.email,
    });
    return c.json({ token });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.post("/api/v1/auth/reset-password/finish", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.token || !body.otp || !body.newPassword) {
      return c.json({ error: "Missing required fields (token, otp, newPassword)" }, 400);
    }
    await authService.finishResetPassword({
      token: body.token,
      otp: body.otp,
      newPassword: body.newPassword,
    });
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.get("/api/v1/traces/:traceId/summary", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const traceId = c.req.param("traceId");

  try {
    const summary = await logService.getTraceSummary({ userId, traceId });
    if (!summary) {
      return c.json({ error: "Trace summary not found" }, 404);
    }
    return c.json(summary);
  } catch (error: any) {
    console.error("[SummaryRoute] Failed to load trace summary:", error);
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.get("/api/v1/traces", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");

  if (!Number.isInteger(page) || page < 1) {
    return c.json({ error: "Invalid page: must be a positive integer" }, 400);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return c.json({ error: "Invalid limit: must be an integer between 1 and 100" }, 400);
  }

  try {
    return c.json(await logService.listTraces({ userId, page, limit }));
  } catch (error: any) {
    console.error("[TraceListRoute] Failed to list traces:", error);
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.delete("/api/v1/traces/:traceId", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const traceId = c.req.param("traceId");

  try {
    // ClickHouse mutations are submitted with mutations_sync=0, so heavy row
    // removal runs asynchronously while this request only waits for acceptance.
    await logService.deleteTrace({ userId, traceId });
    return c.json({ accepted: true }, 202);
  } catch (error: any) {
    console.error("[TraceDeleteRoute] Failed to schedule trace deletion:", error);
    const status = error.message === "Trace not found" ? 404 : (error.statusCode || 500);
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

app.get("/api/v1/traces/:traceId/flow", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const traceId = c.req.param("traceId");

  // Robust Validation
  const thresholdRaw = c.req.query("threshold") || "0";
  const limitRaw = c.req.query("limit") || "1000";
  const cursor = c.req.query("cursor");

  const threshold = parseInt(thresholdRaw, 10);
  if (isNaN(threshold) || threshold < 0) {
    return c.json({ error: "Invalid threshold: must be a non-negative integer" }, 400);
  }

  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1 || limit > 1000) {
    return c.json({ error: "Invalid limit: must be an integer between 1 and 1000" }, 400);
  }

  try {
    const flow = await logService.projectTraceFlow({
      userId,
      traceId,
      threshold,
      cursor,
      limit,
    });
    return c.json(flow);
  } catch (error: any) {
    console.error("[FlowRoute] Failed to project trace flow:", error);
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

export default app;

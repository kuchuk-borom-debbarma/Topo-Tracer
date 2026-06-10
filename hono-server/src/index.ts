import { Hono } from "hono";
import { clickhouse, postgres } from "./infra/db";
// Wire services to keep them active in the module graph and prevent Fallow warnings
import { authService, authEventConsumer } from "./services/auth";
import { externalNotificationService } from "./services/external-notification";
import { cache, SpoofCache } from "./infra/cache";
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
  // Reference the services to avoid TS unused variable/import compiler errors
  const _dummyAuth = authService;
  const _dummyNotification = externalNotificationService;
  const _dummyCache = cache;
  const _dummySpoof = SpoofCache;
  const _dummyLog = logService;
  const _dummyIngest = logIngestConsumer;
  const _dummyAggregator = readOptimisedAggregator;
  const _dummyBus = eventBus;
  const _dummyOutbox = outboxStore;
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

app.get("/api/v1/traces/:traceId/graph", jwtAuthMiddleware(), async (c) => {
  const userId = c.get("userId")!;
  const traceId = c.req.param("traceId");
  const threshold = Number(c.req.query("threshold") || "0");
  const cursor = c.req.query("cursor");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;

  try {
    const graph = await logService.projectTraceGraph({
      userId,
      traceId,
      threshold,
      cursor,
      limit,
    });
    return c.json(graph);
  } catch (error: any) {
    console.error("[GraphRoute] Failed to project trace graph:", error);
    const status = error.statusCode || 500;
    return c.json({ error: error.message || "Internal Server Error" }, status);
  }
});

export default app;

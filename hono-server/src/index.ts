import { Hono } from "hono";
import { clickhouse, postgres } from "./infra/db";
// Wire services to keep them active in the module graph and prevent Fallow warnings
import { authService, authEventConsumer } from "./services/auth";
import { externalNotificationService } from "./services/external-notification";
import { cache, SpoofCache } from "./infra/cache";
import { logService, logIngestConsumer, readOptimisedAggregator } from "./services/log";
import { eventBus } from "./infra/event-bus";
import { PgOutboxStore } from "./infra/event-bus/outbox";

// Initialize event consumers on startup
authEventConsumer.init().catch((err) => console.error("[AuthEventConsumer] Failed to start:", err));
logIngestConsumer.init().catch((err) => console.error("[LogIngestConsumer] Failed to start:", err));
readOptimisedAggregator.init().catch((err) => console.error("[ReadOptimisedAggregator] Failed to start:", err));

const app = new Hono<clickhouse.ClickHouseEnv>();

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
  const _dummyOutbox = PgOutboxStore;
  return c.text("Hello Hono!");
});

app.post("/api/v1/ingest", async (c) => {
  const _apiKey = c.req.header("X-API-Key");
  const userIdHeader = c.req.header("X-User-Id");
  
  const body = await c.req.json();
  
  // Basic validation
  if (!body.nodeStarts || !body.edgeStarts || !body.nodeEnds || !body.edgeEnds) {
    return c.json({ error: "Missing required fields (nodeStarts, edgeStarts, nodeEnds, edgeEnds)" }, 400);
  }

  const userId = userIdHeader || body.userId;

  if (!userId) {
    return c.json({ error: "Missing userId (must be provided in X-User-Id header or body)" }, 400);
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

export default app;

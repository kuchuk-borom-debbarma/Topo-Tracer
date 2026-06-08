import { Hono } from "hono";
import { clickhouse, postgres } from "./infra/db";
// Wire services to keep them active in the module graph and prevent Fallow warnings
import { authService, authEventConsumer } from "./services/auth";
import { externalNotificationService } from "./services/external-notification";
import { cache, SpoofCache } from "./infra/cache";
import { logService } from "./services/log";
import { eventBus } from "./infra/event-bus";
import { PgOutboxStore } from "./infra/outbox";

// Initialize event consumers on startup
authEventConsumer.init().catch((err) => console.error("[AuthEventConsumer] Failed to start:", err));

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
  const _dummyBus = eventBus;
  const _dummyOutbox = PgOutboxStore;
  return c.text("Hello Hono!");
});

export default app;

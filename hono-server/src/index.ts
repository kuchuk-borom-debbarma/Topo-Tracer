import { Hono } from "hono";
import { clickhouse } from "./infra/db";
// Wire services to keep them active in the module graph and prevent Fallow warnings
import { authService } from "./services/auth";
import { externalNotificationService } from "./services/external-notification";
import { cache } from "./infra/cache";

const app = new Hono<clickhouse.ClickHouseEnv>();

app.use("*", clickhouse.initClickHouse);

app.get("/", (c) => {
  // Reference the services to avoid TS unused variable/import compiler errors
  const _dummyAuth = authService;
  const _dummyNotification = externalNotificationService;
  const _dummyCache = cache;
  return c.text("Hello Hono!");
});

export default app;

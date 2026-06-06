import { Hono } from "hono";
import { clickhouse } from "./infra/db";

const app = new Hono<clickhouse.ClickHouseEnv>();

app.use("*", clickhouse.initClickHouse);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

export default app;

import {
  createClient,
  type ClickHouseClient,
  type ClickHouseClientConfigOptions,
} from "@clickhouse/client-web";
import type { Context, MiddlewareHandler } from "hono";
import { getStringEnvValue, type AppEnv } from "../../../common/env";

export type ClickHouseEnvConfig = {
  url: string;
  username: string;
  password: string;
  database: string;
};

export type ClickHouseEnv = AppEnv;

export type ClickHouseContext = Context<ClickHouseEnv>;

// Simple singleton: long-lived servers keep this for the process lifetime, and
// Workers keep it when the isolate is reused. A cold Worker isolate starts empty.
let clickHouseClient: ClickHouseClient | undefined;

export const getClickHouseEnvConfig = (
  c: ClickHouseContext,
): ClickHouseEnvConfig => {
  return {
    url: getStringEnvValue(c, "CLICKHOUSE_URL") ?? "http://localhost:8123",
    username: getStringEnvValue(c, "CLICKHOUSE_USERNAME") ?? "default",
    password: getStringEnvValue(c, "CLICKHOUSE_PASSWORD") ?? "",
    database: getStringEnvValue(c, "CLICKHOUSE_DATABASE") ?? "default",
  };
};

export const getClickHouseClientConfig = (
  c: ClickHouseContext,
): ClickHouseClientConfigOptions => {
  return getClickHouseEnvConfig(c);
};

export const createClickHouseClient = (
  config: ClickHouseClientConfigOptions,
): ClickHouseClient => {
  return createClient(config);
};

// Env bindings come from Hono context, so the first request creates the client.
// After that, use the singleton whenever the runtime keeps this module alive.
export const getClickHouseClient = (c: ClickHouseContext): ClickHouseClient => {
  clickHouseClient ??= createClickHouseClient(getClickHouseClientConfig(c));
  return clickHouseClient;
};

// Install this globally when every request is expected to need ClickHouse. The
// middleware still goes through getClickHouseClient(), so the singleton decides
// whether this request creates or reuses the client.
export const initClickHouse: MiddlewareHandler<ClickHouseEnv> = async (
  c,
  next,
) => {
  getClickHouseClient(c);
  await next();
};

export {
  CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_NODE_EVENTS_TABLE,
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
  CLICKHOUSE_SCHEMA_STATEMENTS,
} from "./schema";

import {
  createClient,
  type ClickHouseClient,
  type ClickHouseClientConfigOptions,
} from "@clickhouse/client-web";
import type { Context, MiddlewareHandler } from "hono";
import {
  getStringEnvValue,
  type AppBindings,
  type AppVariables,
} from "../../../common/env";

export type ClickHouseEnvConfig = {
  url: string;
  username: string;
  password: string;
  database: string;
};

export type ClickHouseVariables = AppVariables & {
  clickhouseClient?: ClickHouseClient;
};

export type ClickHouseEnv = {
  Bindings: AppBindings;
  Variables: ClickHouseVariables;
};

export type ClickHouseContext = Context<ClickHouseEnv>;

// Cloudflare Workers may reuse a module instance across requests, while a
// traditional Hono server keeps the process alive. This cache lets both runtimes
// reuse clients when they can, without assuming the module will live forever.
const clientCache = new Map<string, ClickHouseClient>();

// The key includes the full connection config so local, staging, and production
// bindings do not accidentally share a client if the same process hosts them.
const getClickHouseCacheKey = (config: ClickHouseEnvConfig): string => {
  return JSON.stringify(config);
};

export const getClickHouseEnvConfig = <E extends ClickHouseEnv>(
  c: Context<E>,
): ClickHouseEnvConfig => {
  return {
    url: getStringEnvValue(c, "CLICKHOUSE_URL") ?? "http://localhost:8123",
    username: getStringEnvValue(c, "CLICKHOUSE_USERNAME") ?? "default",
    password: getStringEnvValue(c, "CLICKHOUSE_PASSWORD") ?? "",
    database: getStringEnvValue(c, "CLICKHOUSE_DATABASE") ?? "default",
  };
};

export const getClickHouseClientConfig = <E extends ClickHouseEnv>(
  c: Context<E>,
): ClickHouseClientConfigOptions => {
  return getClickHouseEnvConfig(c);
};

export const createClickHouseClient = (
  config: ClickHouseClientConfigOptions,
): ClickHouseClient => {
  return createClient(config);
};

// Initialize ClickHouse through request context instead of startup-only globals:
// - env bindings are available from Hono context in Workers;
// - repeated access in the same request uses c.var;
// - long-lived runtimes reuse the module-level cached client;
// - Worker cold starts create a client, while reused isolates can reuse one.
export const getClickHouseClient = (c: ClickHouseContext): ClickHouseClient => {
  const requestClient = c.get("clickhouseClient");
  if (requestClient) {
    return requestClient;
  }

  const config = getClickHouseEnvConfig(c);
  const cacheKey = getClickHouseCacheKey(config);
  const cachedClient = clientCache.get(cacheKey);
  if (cachedClient) {
    c.set("clickhouseClient", cachedClient);
    return cachedClient;
  }

  const client = createClickHouseClient(config);
  clientCache.set(cacheKey, client);
  c.set("clickhouseClient", client);
  return client;
};

// Install this globally when every request is expected to need ClickHouse. The
// middleware still goes through getClickHouseClient(), so it reuses the
// singleton/cache when available instead of constructing a new client each time.
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

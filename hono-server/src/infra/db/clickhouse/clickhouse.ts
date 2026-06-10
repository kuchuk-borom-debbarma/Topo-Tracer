import {
  createClient,
  type ClickHouseClient,
  type ClickHouseClientConfigOptions,
} from "@clickhouse/client-web";
import type { Context, MiddlewareHandler } from "hono";
import {
  getStringEnvValue,
  type AppBindings,
  type AppEnv,
} from "../../../common/env";
import { CLICKHOUSE_SCHEMA_STATEMENTS } from "./schema";

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
let clickHouseBootstrapped = false;

const getClickHouseStringEnv = (
  c: ClickHouseContext,
  key: keyof AppBindings,
  fallback: string,
): string => {
  return getStringEnvValue(c, key) ?? fallback;
};

export const getClickHouseEnvConfig = (
  c: ClickHouseContext,
): ClickHouseEnvConfig => {
  return {
    url: getClickHouseStringEnv(c, "CLICKHOUSE_URL", "http://localhost:8123"),
    username: getClickHouseStringEnv(c, "CLICKHOUSE_USERNAME", "default"),
    password: getClickHouseStringEnv(c, "CLICKHOUSE_PASSWORD", ""),
    database: getClickHouseStringEnv(c, "CLICKHOUSE_DATABASE", "default"),
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

/**
 * Direct initialization helper for ClickHouse client.
 * Used for background tasks/daemons that start before any HTTP requests or outside a Hono Context.
 */
export const initializeClickHouseClientDirectly = (
  config?: ClickHouseClientConfigOptions,
): ClickHouseClient => {
  if (!clickHouseClient) {
    const finalConfig = config ?? {
      url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
      username: process.env.CLICKHOUSE_USERNAME ?? "default",
      password: process.env.CLICKHOUSE_PASSWORD ?? "password",
      database: process.env.CLICKHOUSE_DATABASE ?? "default",
    };
    clickHouseClient = createClickHouseClient(finalConfig);
  }
  return clickHouseClient;
};

/**
 * Initializes the ClickHouse client and ensures all database tables and materialized views are created.
 * Used during application boot/startup. Runs migrations exactly once per isolate lifecycle.
 */
export const bootstrapClickHouse = async (
  config?: ClickHouseClientConfigOptions,
): Promise<ClickHouseClient> => {
  const client = initializeClickHouseClientDirectly(config);
  if (!clickHouseBootstrapped) {
    for (const statement of CLICKHOUSE_SCHEMA_STATEMENTS) {
      await client.exec({ query: statement });
    }
    clickHouseBootstrapped = true;
  }
  return client;
};

// Env bindings come from Hono context, so the first request creates the client.
// After that, use the singleton whenever the runtime keeps this module alive.
export const getClickHouseClient = (c: ClickHouseContext): ClickHouseClient => {
  clickHouseClient ??= createClickHouseClient(getClickHouseClientConfig(c));
  return clickHouseClient;
};

// Repositories run below route/middleware code, so they should not know about
// Hono context. initClickHouse() must run first and populate this singleton.
export const getInitializedClickHouseClient = (): ClickHouseClient => {
  if (!clickHouseClient) {
    throw new Error("ClickHouse client has not been initialized.");
  }
  return clickHouseClient;
};

// Install this globally when every request is expected to need ClickHouse. The
// middleware still goes through getClickHouseClient(), so the singleton decides
// whether this request creates or reuses the client.
export const initClickHouse: MiddlewareHandler<ClickHouseEnv> = async (
  c,
  next,
) => {
  const config = getClickHouseClientConfig(c);
  await bootstrapClickHouse(config);
  await next();
};

export {
  CLICKHOUSE_CREATE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_NODE_EVENTS_TABLE,
  CLICKHOUSE_CREATE_READ_NODES_TABLE,
  CLICKHOUSE_CREATE_READ_EDGES_TABLE,
  CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_CREATE_MATERIALIZATION_CHECKPOINTS_TABLE,
  CLICKHOUSE_CREATE_TRACE_SUMMARIES_REALTIME_TABLE,
  CLICKHOUSE_CREATE_NODE_EVENTS_SUMMARY_MV,
  CLICKHOUSE_CREATE_EDGE_EVENTS_SUMMARY_MV,
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
  CLICKHOUSE_READ_NODES_TABLE,
  CLICKHOUSE_READ_EDGES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE,
  CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_SUMMARY_MV,
  CLICKHOUSE_EDGE_EVENTS_SUMMARY_MV,
  CLICKHOUSE_SCHEMA_STATEMENTS,
} from "./schema";

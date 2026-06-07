import { env as honoEnv, type Runtime } from "hono/adapter";
import type { Context } from "hono";

// Keep runtime bindings in one shared type so routes and infra agree on the
// names without depending on a specific deployment platform.
export type AppBindings = Record<string, unknown> & {
  CLICKHOUSE_URL?: string;
  CLICKHOUSE_USERNAME?: string;
  CLICKHOUSE_PASSWORD?: string;
  CLICKHOUSE_DATABASE?: string;
  JWT_SECRET?: string;
  POSTGRES_URL?: string;
  KAFKA_BROKERS?: string;
};

export type AppVariables = Record<string, unknown>;

export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};

// fallow-ignore-next-line unused-type
export type AppContext = Context<AppEnv>;

// Hono's adapter reads from process.env, Deno.env, or c.env depending on the
// runtime. Use this wrapper instead of platform-specific env access.
// fallow-ignore-next-line unused-export
export const getEnv = <E extends AppEnv>(
  c: Context<E>,
  runtime?: Runtime,
): AppBindings => {
  return honoEnv<AppBindings>(c, runtime);
};

// Use this for bindings whose runtime type may not be known yet, such as
// platform objects or secrets that need validation at the call site.
// fallow-ignore-next-line unused-export
export const getEnvValue = <E extends AppEnv>(
  c: Context<E>,
  key: keyof AppBindings,
): unknown => {
  return getEnv(c)[key];
};

// Most app configuration is string-based. This helper keeps that common case
// explicit and avoids sprinkling typeof checks across route handlers.
export const getStringEnvValue = <E extends AppEnv>(
  c: Context<E>,
  key: keyof AppBindings,
): string | undefined => {
  const value = getEnvValue(c, key);
  return typeof value === "string" ? value : undefined;
};

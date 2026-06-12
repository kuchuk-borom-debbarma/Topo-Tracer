import postgres from "postgres";
import type { Context, MiddlewareHandler } from "hono";
import { getStringEnvValue, type AppEnv } from "../../../common/env";
import { POSTGRES_SCHEMA_STATEMENTS } from "./schema";

export type PostgresEnv = AppEnv;
type PostgresContext = Context<PostgresEnv>;

let sqlClient: postgres.Sql | undefined;
let postgresBootstrapped = false;

const EXPECTED_BOOTSTRAP_NOTICE_CODES = new Set(["42P07", "42701"]);

/**
 * Direct initialization helper for PostgreSQL client.
 * Used for background tasks/daemons that start before any HTTP requests or outside a Hono Context.
 */
// fallow-ignore-next-line complexity
const initializePostgresClientDirectly = (connectionString?: string): postgres.Sql => {
  if (!sqlClient) {
    const connStr =
      connectionString ??
      (typeof process !== "undefined" ? process.env.POSTGRES_URL : undefined) ??
      "postgres://postgres:password@localhost:5432/topo_tracer";

    sqlClient = postgres(connStr, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      onnotice: (notice) => {
        if (EXPECTED_BOOTSTRAP_NOTICE_CODES.has(notice.code)) return;
        console.info(notice);
      },
    });
  }
  return sqlClient;
};

/**
 * Retrieves the PostgreSQL database client singleton instance.
 * Initializes it on first call using POSTGRES_URL env binding.
 */
const getPostgresClient = (c: PostgresContext): postgres.Sql => {
  if (!sqlClient) {
    const connectionString =
      getStringEnvValue(c, "POSTGRES_URL") ??
      "postgres://postgres:password@localhost:5432/topo_tracer";

    initializePostgresClientDirectly(connectionString);
  }
  return sqlClient!;
};

/**
 * Returns the already initialized PostgreSQL database client singleton.
 * Throws an error if called before initialization.
 */
export const getInitializedPostgresClient = (): postgres.Sql => {
  if (!sqlClient) {
    throw new Error("PostgreSQL client has not been initialized.");
  }
  return sqlClient;
};

/**
 * Initializes the PostgreSQL client and ensures all database tables are created.
 * Used during application boot/startup.
 */
export const bootstrapPostgres = async (connectionString?: string): Promise<postgres.Sql> => {
  const sql = initializePostgresClientDirectly(connectionString);
  if (!postgresBootstrapped) {
    for (const statement of POSTGRES_SCHEMA_STATEMENTS) {
      await sql.unsafe(statement);
    }
    postgresBootstrapped = true;
  }
  return sql;
};

/**
 * Middleware handler to initialize PostgreSQL client and execute table schemas.
 */
export const initPostgres: MiddlewareHandler<PostgresEnv> = async (c, next) => {
  const connectionString = getStringEnvValue(c, "POSTGRES_URL");
  await bootstrapPostgres(connectionString);
  await next();
};

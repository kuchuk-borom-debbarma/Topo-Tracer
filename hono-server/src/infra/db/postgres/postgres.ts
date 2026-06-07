import postgres from "postgres";
import type { Context, MiddlewareHandler } from "hono";
import { getStringEnvValue, type AppEnv } from "../../../common/env";
import { POSTGRES_SCHEMA_STATEMENTS } from "./schema";

export type PostgresEnv = AppEnv;
type PostgresContext = Context<PostgresEnv>;

let sqlClient: postgres.Sql | undefined;

/**
 * Retrieves the PostgreSQL database client singleton instance.
 * Initializes it on first call using POSTGRES_URL env binding.
 */
const getPostgresClient = (c: PostgresContext): postgres.Sql => {
  if (!sqlClient) {
    const connectionString =
      getStringEnvValue(c, "POSTGRES_URL") ??
      "postgres://postgres:password@localhost:5432/topo_tracer";

    sqlClient = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
    });
  }
  return sqlClient;
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
 * Middleware handler to initialize PostgreSQL client and execute table schemas.
 */
export const initPostgres: MiddlewareHandler<PostgresEnv> = async (c, next) => {
  const sql = getPostgresClient(c);

  // Sequentially create database tables if they do not exist
  for (const statement of POSTGRES_SCHEMA_STATEMENTS) {
    await sql.unsafe(statement);
  }

  await next();
};

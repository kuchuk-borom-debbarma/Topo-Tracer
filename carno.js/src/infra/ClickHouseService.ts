import { OnApplicationInit, Service } from "@carno.js/core";
import { createClient, type ClickHouseClient } from "@clickhouse/client";

@Service()
export class ClickHouseService {
  private clientInstance!: ClickHouseClient;

  get client(): ClickHouseClient {
    return this.clientInstance;
  }

  @OnApplicationInit()
  async init(): Promise<void> {
    this.clientInstance = createClient({
      url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "password",
    });

    await this.runMigrations();
  }

  private async runMigrations(): Promise<void> {
    await this.clientInstance.command({
      query: "CREATE DATABASE IF NOT EXISTS toco_tracer",
    });

    await this.resetSchema();

    // 1. Raw Append-Only Ingestion Logs
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.raw_spans (
          id String,
          trace_id String,
          name String,
          group_name String,
          level Int32,
          tags Map(String, String),
          event_type Enum8('started' = 1, 'ended' = 2),
          timestamp Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, timestamp);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.raw_edges (
          id String,
          trace_id String,
          from_span_id String,
          to_span_id String,
          timestamp Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, timestamp);
      `,
    });

    // 2. Read-Optimized Materialized Structures
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_spans (
          id String,
          trace_id String,
          name String,
          group_name String,
          level Int32,
          tags Map(String, String),
          start_time_us Int64,
          end_time_us Nullable(Int64),
          duration_us Nullable(Int64),
          ancestry_path Array(String)
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, start_time_us);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
          id String,
          trace_id String,
          from_span_id String,
          to_span_id String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, id);
      `,
    });
  }

  private async resetSchema(): Promise<void> {
    const tables = [
      "read_edges",
      "read_spans",
      "raw_edges",
      "raw_spans",
      "read_traces",
      "read_nodes",
      "read_containers",
      "raw_nodes",
      "raw_containers",
      "trace_metadata",
    ];

    for (const table of tables) {
      await this.clientInstance.command({
        query: `DROP TABLE IF EXISTS toco_tracer.${table}`,
      });
    }
  }
}

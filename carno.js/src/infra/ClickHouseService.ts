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
          parent_id String,
          name String,
          kind Enum8('boundary' = 1, 'execution' = 2),
          type String,
          tags Map(String, String),
          event_type Enum8('started' = 1, 'ended' = 2),
          timestamp Int64,
          level_names Map(UInt16, String),
          view_level UInt16
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
          type String,
          timestamp Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, timestamp);
      `,
    });

    // 2. Read-Optimized Materialized Structures
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_traces (
          trace_id String,
          container_ids Array(String),
          tags Array(String),
          level_names Map(UInt16, String),
          layout_json String,
          created_at Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_spans (
          id String,
          trace_id String,
          parent_id String,
          name String,
          kind Enum8('boundary' = 1, 'execution' = 2),
          type String,
          tags Map(String, String),
          parentage Array(String),
          view_level UInt16,
          local_sequence UInt32,
          start_time_us Int64,
          duration_us Nullable(Int64),
          metadata String
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
          to_span_id String,
          type String,
          distance Int32,
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, id);
      `,
    });
  }

  private async resetSchema(): Promise<void> {
    const tables = [
      "read_edges",
      "read_spans",
      "read_traces",
      "raw_edges",
      "raw_spans",
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

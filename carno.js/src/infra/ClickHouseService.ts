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
        CREATE TABLE IF NOT EXISTS toco_tracer.raw_containers (
          id String,
          trace_id String,
          parent_container_id String,
          name String,
          type String,
          tags Array(String),
          event_type Enum8('started' = 1, 'ended' = 2),
          timestamp Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, timestamp);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.raw_nodes (
          id String,
          trace_id String,
          container_id String,
          name String,
          type String,
          tags Array(String),
          event_type Enum8('started' = 1, 'ended' = 2),
          timestamp Int64,
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, timestamp);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.raw_edges (
          id String,
          trace_id String,
          from_node_id String,
          to_node_id String,
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
          created_at Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_containers (
          id String,
          trace_id String,
          parent_container_id String,
          name String,
          type String,
          tags Array(String),
          parentage Array(String),
          start_time_us Int64,
          duration_us Nullable(Int64),
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, start_time_us);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_nodes (
          id String,
          trace_id String,
          container_id String,
          name String,
          type String,
          tags Array(String),
          parentage Array(String),
          local_sequence UInt32,
          start_time_us Int64,
          duration_us Nullable(Int64),
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, container_id, local_sequence);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
          id String,
          trace_id String,
          from_node_id String,
          to_node_id String,
          type String,
          distance Int32,
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.trace_metadata (
          trace_id String,
          is_zoom_ready UInt8,
          max_available_depth UInt16,
          materialized_offset UInt32
        ) ENGINE = ReplacingMergeTree()
        ORDER BY trace_id;
      `,
    });
  }

  private async resetSchema(): Promise<void> {
    const tables = [
      "read_edges",
      "read_nodes",
      "read_containers",
      "read_traces",
      "raw_edges",
      "raw_nodes",
      "raw_containers",
      "trace_metadata",
      "read_blocks",
      "edge_egress_ancestry",
      "node_ancestry",
      "v2_logs",
      "v2_blocks",
      "v2_containers",
      "logs",
      "edges",
      "nodes",
      "blocks",
      "containers",
    ];

    for (const table of tables) {
      await this.clientInstance.command({
        query: `DROP TABLE IF EXISTS toco_tracer.${table}`,
      });
    }
  }
}


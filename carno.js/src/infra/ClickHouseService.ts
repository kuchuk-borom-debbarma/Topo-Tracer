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
    await this.clientInstance.command({ query: "CREATE DATABASE IF NOT EXISTS topo_tracer" });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.primitive_trace_events (
          trace_id String,
          event_id String,
          entity_id String,
          entity_type LowCardinality(String),
          event_type LowCardinality(String),
          occurred_at_ms Int64,
          received_at_ms Int64,
          name Nullable(String),
          depth Nullable(Int32),
          parent_id Nullable(String),
          from_node_id Nullable(String),
          to_node_id Nullable(String),
          label Nullable(String),
          status Nullable(String),
          data String
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(toDateTime(received_at_ms / 1000))
        ORDER BY (trace_id, received_at_ms, event_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.primitive_read_nodes (
          trace_id String,
          id String,
          parent_id Nullable(String),
          name String,
          depth Int32,
          status LowCardinality(String),
          started_at_ms Nullable(Int64),
          ended_at_ms Nullable(Int64),
          duration_ms Nullable(Int64),
          ancestry_path Array(String),
          flow_order Int64,
          diagnostics Array(String),
          data String,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        PARTITION BY sipHash64(trace_id) % 32
        ORDER BY (trace_id, flow_order, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.primitive_read_edges (
          trace_id String,
          id String,
          from_node_id String,
          to_node_id String,
          label String,
          status LowCardinality(String),
          started_at_ms Nullable(Int64),
          ended_at_ms Nullable(Int64),
          duration_ms Nullable(Int64),
          diagnostics Array(String),
          data String,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        PARTITION BY sipHash64(trace_id) % 32
        ORDER BY (trace_id, from_node_id, to_node_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.primitive_read_node_ancestry (
          trace_id String,
          node_id String,
          ancestor_id String,
          depth Int32,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        PARTITION BY sipHash64(trace_id) % 32
        ORDER BY (trace_id, ancestor_id, node_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.primitive_trace_summary (
          trace_id String,
          created_at_ms Int64,
          updated_at_ms Int64,
          node_count UInt64,
          edge_count UInt64,
          error_count UInt64,
          diagnostic_count UInt64,
          max_depth Int32,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY trace_id;
      `,
    });
  }
}

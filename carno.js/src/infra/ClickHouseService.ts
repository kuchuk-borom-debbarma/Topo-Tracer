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
      query: "CREATE DATABASE IF NOT EXISTS topo_tracer",
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.trace_events (
          trace_id String,
          event_id String,
          entity_id String,
          entity_type LowCardinality(String),
          event_type LowCardinality(String),
          occurred_at_ms Int64,
          received_at_ms Int64,
          parent_id Nullable(String),
          container_id Nullable(String),
          from_id Nullable(String),
          to_id Nullable(String),
          kind Nullable(String),
          name Nullable(String),
          status Nullable(String),
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, received_at_ms, event_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.read_containers (
          trace_id String,
          id String,
          parent_id Nullable(String),
          name String,
          kind String,
          status String,
          started_at_ms Nullable(Int64),
          ended_at_ms Nullable(Int64),
          duration_ms Nullable(Int64),
          ancestry_ids Array(String),
          diagnostics Array(String),
          metadata String,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY (trace_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.read_nodes (
          trace_id String,
          id String,
          container_id Nullable(String),
          parent_id Nullable(String),
          name String,
          kind String,
          status String,
          started_at_ms Nullable(Int64),
          ended_at_ms Nullable(Int64),
          duration_ms Nullable(Int64),
          ancestry_ids Array(String),
          flow_order Int64,
          diagnostics Array(String),
          metadata String,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY (trace_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.read_edges (
          trace_id String,
          id String,
          from_id String,
          to_id String,
          kind String,
          status String,
          started_at_ms Nullable(Int64),
          ended_at_ms Nullable(Int64),
          duration_ms Nullable(Int64),
          diagnostics Array(String),
          metadata String,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY (trace_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.read_container_ancestry (
          trace_id String,
          container_id String,
          ancestor_id String,
          depth Int32,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY (trace_id, container_id, ancestor_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.read_node_ancestry (
          trace_id String,
          node_id String,
          ancestor_id String,
          depth Int32,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY (trace_id, node_id, ancestor_id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.read_trace_summary (
          trace_id String,
          created_at_ms Int64,
          updated_at_ms Int64,
          container_count UInt64,
          node_count UInt64,
          edge_count UInt64,
          error_count UInt64,
          diagnostic_count UInt64,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY trace_id;
      `,
    });
  }
}

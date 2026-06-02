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

    // Append-only source of truth.
    //
    // ORDER BY starts with trace_id because every materializer/read query is trace-scoped.
    // received_at_ms + event_id gives deterministic replay order when SDK clocks skew.
    // event_id is the idempotency identity; replay queries collapse duplicate retries.
    // importance_level is SDK-provided semantic importance: 0 = most important.

    // TODO explain each column, also why so many fields that are not mandatory? lets keep design simple and remove unnecessary columns
    // TODO Do you think we will benifit from storing edges[] ancestry too?
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.node_trace_events (
          trace_id String,
          event_id String,
          entity_id String,
          entity_type LowCardinality(String),
          event_type LowCardinality(String),
          occurred_at_ms Int64,
          received_at_ms Int64,
          name Nullable(String),
          importance_level Nullable(Int32),
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

    // Read-optimized nodes.
    //
    // ReplacingMergeTree lets worker rebuild read rows after late events without
    // mutating raw history. ORDER BY uses the logical row identity, so a changed
    // flow_order replaces the old node instead of leaving a stale copy.
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.node_read_nodes (
          trace_id String,
          id String,
          parent_id Nullable(String),
          name String,
          importance_level Int32,
          status LowCardinality(String),
          started_at_ms Nullable(Int64),
          ended_at_ms Nullable(Int64),
          duration_ms Nullable(Int64),
          ancestry_path Array(String),
          indent_level Int32,
          flow_order Int64,
          diagnostics Array(String),
          data String,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        PARTITION BY sipHash64(trace_id) % 32
        ORDER BY (trace_id, id);
      `,
    });

    // Read-optimized edges.
    //
    // Edges are looked up by trace, then lifted to visible/ghost endpoints in
    // application code. ORDER BY uses edge identity for rebuild correctness.

    // TODO Why call it read edges when all it is storing is completed edges so lets just call it edges? correct me on this. For read nodes it makes sense because it has some read optimised columns like ancestry_path.
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.node_read_edges (
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
        ORDER BY (trace_id, id);
      `,
    });

    // Trace list/slider metadata.
    //
    // max_importance_level drives frontend slider max without loading graph.
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.node_trace_summary (
          trace_id String,
          created_at_ms Int64,
          updated_at_ms Int64,
          node_count UInt64,
          edge_count UInt64,
          error_count UInt64,
          diagnostic_count UInt64,
          max_importance_level Int32,
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY trace_id;
      `,
    });
  }
}

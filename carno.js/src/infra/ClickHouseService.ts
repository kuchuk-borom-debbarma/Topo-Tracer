import { Service, OnApplicationInit } from "@carno.js/core";
import { createClient, type ClickHouseClient } from "@clickhouse/client";

@Service()
export class ClickHouseService {
  private clientInstance!: ClickHouseClient;

  // Getter to access ClickHouse client instance
  get client(): ClickHouseClient {
    return this.clientInstance;
  }

  // Lifecycle hook called automatically when application boots up
  @OnApplicationInit()
  async init(): Promise<void> {
    console.log("[ClickHouseService] Initializing ClickHouse Connection...");
    
    this.clientInstance = createClient({
      host: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
    });

    try {
      await this.runMigrations();
      console.log("[ClickHouseService] ClickHouse migration completed successfully.");
    } catch (error) {
      console.error("[ClickHouseService] Migration failed:", error);
      throw error;
    }
  }

  // Create database and necessary tables with MergeTree engines
  private async runMigrations(): Promise<void> {
    // 1. Create database schema namespace
    await this.clientInstance.command({
      query: "CREATE DATABASE IF NOT EXISTS toco_tracer",
    });

    // 2. Create Containers Table (Physical limits)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.containers (
          id String,
          name String,
          containerType String,
          createdAtLocal Int64,
          createdAtRemote Int64
        ) ENGINE = MergeTree()
        ORDER BY id;
      `,
    });

    // 3. Create Nodes Table (Logical checkpoints inside stack)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.nodes (
          id String,
          trace_id String,
          containerId String,
          parentNodeId String,
          name String,
          nodeType String,
          depthIndex UInt32,
          metadata String,
          initiatedAtLocal Int64,
          processedAtLocal Int64,
          completedAtLocal Nullable(Int64),
          ancestryPath Array(String)
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, depthIndex, initiatedAtLocal);
      `,
    });

    // 4. Create Edges Table (Inter-container network hops)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.edges (
          id String,
          trace_id String,
          fromContainerId String,
          toContainerId String,
          fromNodeId String,
          toNodeId String,
          edgeType String,
          dispatchedAtLocal Int64,
          respondedAtLocal Nullable(Int64),
          egressAncestryPath Array(String)
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, dispatchedAtLocal);
      `,
    });

    // 5. Create Node Ancestry Cache Table (MergeTree)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.node_ancestry (
          node_id String,
          trace_id String,
          ancestryPath Array(String)
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, node_id);
      `,
    });

    // 6. Create Edge Egress Ancestry Cache Table (MergeTree)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.edge_egress_ancestry (
          edge_id String,
          trace_id String,
          egressAncestryPath Array(String)
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, edge_id);
      `,
    });

    // 7. Create Read-Optimized Multi-Resolution Edges Table (MergeTree)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
          id String,
          edge_id String,
          trace_id String,
          visual_depth UInt32,
          from_target_id String,
          from_target_type String,
          to_node_id String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, visual_depth, id);
      `,
    });

    // 8. Create Read-Optimized Trace Metadata Table (MergeTree)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.trace_metadata (
          trace_id String,
          is_zoom_ready UInt8,
          max_available_depth UInt32,
          materialized_offset UInt32
        ) ENGINE = MergeTree()
        ORDER BY trace_id;
      `,
    });
  }
}

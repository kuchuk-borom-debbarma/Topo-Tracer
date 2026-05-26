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
          createdAtLocal DateTime64(3, 'UTC'),
          createdAtRemote DateTime64(3, 'UTC')
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
          initiatedAtLocal DateTime64(3, 'UTC'),
          processedAtLocal DateTime64(3, 'UTC'),
          completedAtLocal Nullable(DateTime64(3, 'UTC'))
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
          dispatchedAtLocal DateTime64(3, 'UTC'),
          respondedAtLocal Nullable(DateTime64(3, 'UTC'))
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, dispatchedAtLocal);
      `,
    });
  }
}

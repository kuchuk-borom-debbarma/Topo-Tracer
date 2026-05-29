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

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.containers (
          id String,
          trace_id String,
          name String,
          type String,
          metadata String,
          createdAtLocal Int64,
          createdAtRemote Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.blocks (
          id String,
          trace_id String,
          containerId String,
          name String,
          type String,
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, containerId, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.nodes (
          id String,
          trace_id String,
          blockId String,
          name String,
          type String,
          metadata String,
          eventType Enum8('started' = 1, 'ended' = 2),
          eventAtLocal Int64,
          ingestedAtRemote Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, blockId, id, eventAtLocal);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.edges (
          id String,
          trace_id String,
          fromNodeId String,
          toNodeId String,
          type String,
          metadata String,
          eventType Enum8('requested' = 1, 'responded' = 2),
          eventAtLocal Int64,
          ingestedAtRemote Int64
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, id, eventAtLocal);
      `,
    });
  }

  private async resetSchema(): Promise<void> {
    const tables = [
      "trace_metadata",
      "read_edges",
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

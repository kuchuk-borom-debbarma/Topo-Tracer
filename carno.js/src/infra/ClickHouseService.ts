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

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_blocks (
          id String,                  -- Unique ID of the block (maps to raw TraceBlock.id)
          trace_id String,            -- The globally unique trace ID
          container_id String,        -- Container/service where this block ran
          parent_block_id String,     -- Parent block ID calling this block (empty if root)
          calling_node_id String,     -- The exact Node ID inside parent_block that triggered this block
          name String,                -- Human-readable function call scope name (e.g. 'foo()')
          type String,                -- Scope type (e.g. 'function', 'rpc')
          absolute_depth UInt16,      -- Horizontal offset X-coordinate: 0 = root block, 1 = nested, etc.
          start_time_us Int64,        -- Earliest start timestamp derived from child nodes (in microseconds)
          duration_us Nullable(Int64),-- Derived block execution duration (in microseconds)
          metadata String             -- Stringified JSON baggage properties
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, absolute_depth, start_time_us);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_nodes (
          id String,                  -- Unique ID of the node (maps to raw TraceNode.id)
          trace_id String,            -- The globally unique trace ID
          block_id String,            -- Containing Block ID
          name String,                -- Human-readable node/log name
          type String,                -- Checkpoint type (e.g. 'db', 'log')
          zoom_level UInt8,           -- Verbosity importance: 0 = critical, 1 = key, 2 = detailed
          local_sequence UInt32,      -- Vertical flow index Y-coordinate inside this block
          start_time_us Int64,        -- Timing for started event (in microseconds)
          duration_us Nullable(Int64),-- Node execution duration (in microseconds)
          metadata String             -- Stringified JSON baggage properties
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, block_id, local_sequence);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.read_edges (
          id String,                  -- Unique row ID (edge_id + zoom_level)
          edge_id String,             -- Unique ID of the edge (maps to raw TraceEdge.id)
          trace_id String,            -- The globally unique trace ID
          from_block_id String,       -- Source block ID containing the calling node
          from_node_id String,        -- Source calling Node ID that dispatched the call
          to_block_id String,         -- Destination block ID receiving the call
          to_node_id String           -- Destination entry Node ID that accepted the call
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, id);
      `,
    });

    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.trace_metadata (
          trace_id String,            -- The globally unique trace ID
          is_zoom_ready UInt8,        -- Completion status of layout: 1 = ready, 0 = materializing
          max_available_depth UInt16,  -- Max structural call-depth resolved (used to size UI slider range)
          materialized_offset UInt32  -- Completed offset index in materialization queue
        ) ENGINE = ReplacingMergeTree()
        ORDER BY trace_id;
      `,
    });
  }

  private async resetSchema(): Promise<void> {
    const tables = [
      "trace_metadata",
      "read_edges",
      "read_nodes",
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


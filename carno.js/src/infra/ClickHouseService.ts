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
      url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "password",
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
          id String,                        -- Unique identifier for the node (e.g. UUID)
          trace_id String,                  -- The globally unique trace ID this node belongs to
          containerId String,               -- The physical container/service where this node ran
          parentNodeId String,              -- Parent node ID for intra-container hierarchical nesting
          name String,                      -- Human-readable name (e.g. 'POST /v1/checkout' or 'DB Query')
          nodeType String,                  -- E.g. 'http_server', 'database', 'internal_function'
          depthIndex UInt32,                -- Zero-indexed nesting depth from the trace root. Used for zoom-level filtering.
          metadata String,                  -- JSON stringified custom payload/baggage properties
          initiatedAtLocal Int64,           -- Timestamp when execution started (ms)
          processedAtLocal Int64,           -- Timestamp when execution logic finished (ms)
          completedAtLocal Nullable(Int64), -- Timestamp when all children completed (ms)
          ancestryPath Array(String)        -- Ordered array of parent node IDs up to the root, used for bubbling up visuals
        ) ENGINE = MergeTree()
        ORDER BY (trace_id, depthIndex, initiatedAtLocal);
      `,
    });

    // 4. Create Edges Table (Inter-container network hops)
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS toco_tracer.edges (
          id String,                        -- Unique identifier for the edge
          trace_id String,                  -- The globally unique trace ID
          fromContainerId String,           -- The source physical container ID
          toContainerId String,             -- The destination physical container ID
          fromNodeId String,                -- The exact egress node ID that dispatched the call
          toNodeId String,                  -- The exact ingress node ID that received the call
          edgeType String,                  -- Protocol used (e.g., 'http', 'kafka_message', 'grpc')
          dispatchedAtLocal Int64,          -- When the call was sent from the source (ms)
          respondedAtLocal Nullable(Int64), -- When the source received a response (ms)
          egressAncestryPath Array(String)  -- Ordered parents of fromNodeId, cached for rapid zoom-out collapsing
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
          id String,                        -- Unique composite ID (e.g. edgeId_depthLevel)
          edge_id String,                   -- The underlying raw physical network edge ID
          trace_id String,                  -- The trace ID
          visual_depth UInt32,              -- The UI zoom slider level this row is built for
          from_target_id String,            -- The pre-computed visible source ID at this depth (could be parent node or container)
          from_target_type String,          -- 'node' or 'container', telling the UI what to attach the line to
          to_target_id String,              -- The pre-computed visible destination ID at this depth
          to_target_type String             -- 'node' or 'container', completing the bi-directional collapse
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

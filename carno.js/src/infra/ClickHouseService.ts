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
    //
    // Q: Why keep many nullable columns instead of only trace_id + data JSON?
    // A: This is a compact union of node and edge lifecycle event payloads. The
    // required envelope columns drive trace replay, ordering, and idempotency.
    // Sparse typed payload columns keep common materializer predicates fast and
    // avoid parsing JSON for parent/edge/status/importance fields.
    //
    // Q: Should raw events store edge ancestry arrays too?
    // A: Not yet. Edges do not own ancestry; their endpoints do. Read queries can
    // derive endpoint ancestry from node_read_nodes. If edge projection becomes a
    // bottleneck, add from_ancestry_path/to_ancestry_path to the read edge model.
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.node_trace_events (
          -- Stable trace partition key. All writes, replay, and reads are trace-scoped.
          trace_id String,
          -- SDK/generated idempotency key. Duplicate retries collapse during replay.
          event_id String,
          -- Node id or edge id affected by this event.
          entity_id String,
          -- Event target family: node or edge.
          entity_type LowCardinality(String),
          -- Lifecycle transition, such as node.started or edge.ended.
          event_type LowCardinality(String),
          -- SDK event time used for trace semantics and duration math.
          occurred_at_ms Int64,
          -- Server ingest time used for deterministic replay order and freshness checks.
          received_at_ms Int64,
          -- Node display name. Null for edge-only events or unnamed updates.
          name Nullable(String),
          -- Node importance. Null for edge events and node events that do not set it.
          importance_level Nullable(Int32),
          -- Node parent id. Null for root nodes, edge events, or unchanged updates.
          parent_id Nullable(String),
          -- Edge source node id. Null for node events or incomplete edge updates.
          from_node_id Nullable(String),
          -- Edge target node id. Null for node events or incomplete edge updates.
          to_node_id Nullable(String),
          -- Edge label. Null for node events or default-label edge updates.
          label Nullable(String),
          -- Reported lifecycle status. Null means builder derives status from events.
          status Nullable(String),
          -- Extra user payload kept as JSON string for flexible SDK metadata.
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
          -- Trace key for scoped projection and list/detail reads.
          trace_id String,
          -- Stable node id.
          id String,
          -- Direct parent id. Null for root nodes.
          parent_id Nullable(String),
          -- Resolved display name after replaying node lifecycle events.
          name String,
          -- Resolved importance where 0 is most important.
          importance_level Int32,
          -- Resolved node status after lifecycle merge and diagnostics.
          status LowCardinality(String),
          -- Earliest node start time from replayed events.
          started_at_ms Nullable(Int64),
          -- Latest node end time from replayed events.
          ended_at_ms Nullable(Int64),
          -- ended_at_ms - started_at_ms when both are known.
          duration_ms Nullable(Int64),
          -- Ancestor ids from root to direct parent. Used for ghost grouping and lifting.
          ancestry_path Array(String),
          -- Cached ancestry_path length for layout indentation.
          indent_level Int32,
          -- Stable topological order used for graph/window ordering.
          flow_order Int64,
          -- Builder warnings such as orphanNode, cycleDetected, or missingEnd.
          diagnostics Array(String),
          -- Merged node metadata JSON.
          data String,
          -- Read-model version for ReplacingMergeTree and argMax reads.
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        PARTITION BY sipHash64(trace_id) % 32
        ORDER BY (trace_id, id);
      `,
    });

    // Read-optimized edges.
    //
    // Edges are materialized read rows, not raw completed-edge facts. Projection
    // queries lift endpoints to visible nodes or ghost groups inside ClickHouse.
    // The "read" prefix keeps the table clearly separate from append-only events.
    // ORDER BY uses edge identity for rebuild correctness.
    await this.clientInstance.command({
      query: `
        CREATE TABLE IF NOT EXISTS topo_tracer.node_read_edges (
          -- Trace key for scoped projection reads.
          trace_id String,
          -- Stable edge id.
          id String,
          -- Resolved source node id.
          from_node_id String,
          -- Resolved target node id.
          to_node_id String,
          -- Resolved display label after replaying edge lifecycle events.
          label String,
          -- Resolved edge status after lifecycle merge and diagnostics.
          status LowCardinality(String),
          -- Earliest edge start time from replayed events.
          started_at_ms Nullable(Int64),
          -- Latest edge end time from replayed events.
          ended_at_ms Nullable(Int64),
          -- ended_at_ms - started_at_ms when both are known.
          duration_ms Nullable(Int64),
          -- Builder warnings such as orphanEdge or clockSkewSuspected.
          diagnostics Array(String),
          -- Merged edge metadata JSON.
          data String,
          -- Read-model version for ReplacingMergeTree and argMax reads.
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
          -- Stable trace id shown in trace lists and graph detail routes.
          trace_id String,
          -- Earliest occurred_at_ms in the trace.
          created_at_ms Int64,
          -- Latest occurred_at_ms in the trace.
          updated_at_ms Int64,
          -- Materialized node count.
          node_count UInt64,
          -- Materialized edge count.
          edge_count UInt64,
          -- Count of materialized nodes/edges with error status.
          error_count UInt64,
          -- Total number of materializer diagnostics.
          diagnostic_count UInt64,
          -- Highest node importance; drives the frontend slider max.
          max_importance_level Int32,
          -- Read-model version for ReplacingMergeTree and argMax reads.
          materialized_at_ms Int64
        ) ENGINE = ReplacingMergeTree(materialized_at_ms)
        ORDER BY trace_id;
      `,
    });
  }
}

import { Logger } from "tslog";
import type { ClickHouseClient } from "@clickhouse/client-web";
import {
  CLICKHOUSE_READ_NODES_TABLE,
  CLICKHOUSE_READ_EDGES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
  getInitializedClickHouseClient,
} from "../../../../../infra/db/clickhouse";
import { ReadCheckpoint, ReadNode, ReadEdge, ReadTraceSummary } from "../../../api/types";
import { ILogReadRepo } from "../ILogReadRepo";
import { ReadNodeRow, ReadEdgeRow, TraceSummaryRow, ReadCheckpointRow } from "../types";

export class LogReadRepoClickHouse extends ILogReadRepo {
  readonly logger: Logger<unknown>;
  private readonly getClient: () => Pick<ClickHouseClient, "insert">;

  constructor(
    parentLogger: Logger<unknown>,
    getClient: () => Pick<ClickHouseClient, "insert"> = getInitializedClickHouseClient,
  ) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "LogReadRepoClickHouse",
    });
    this.getClient = getClient;
  }

  async loadCheckpoint(_params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null> {
    throw new Error("loadCheckpoint not implemented until Phase 3 materialization.");
  }

  async loadLatestReadModel(_params: {
    userId: string;
    traceId: string;
  }): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }> {
    throw new Error("loadLatestReadModel not implemented until Phase 3 materialization.");
  }

  async saveReadModel(params: {
    userId: string;
    traceId: string;
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary;
    materializedAt: number;
  }): Promise<void> {
    const nodeRows = this.buildReadNodeRows(params.nodes);
    const edgeRows = this.buildReadEdgeRows(params.edges);
    const summaryRow = this.buildTraceSummaryRow(params.summary);

    this.logger.trace("Saving read model to ClickHouse", {
      userId: params.userId,
      traceId: params.traceId,
      nodes: nodeRows.length,
      edges: edgeRows.length,
    });

    const client = this.getClient();

    if (nodeRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_READ_NODES_TABLE,
        values: nodeRows,
        format: "JSONEachRow",
      });
    }

    if (edgeRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_READ_EDGES_TABLE,
        values: edgeRows,
        format: "JSONEachRow",
      });
    }

    await client.insert({
      table: CLICKHOUSE_TRACE_SUMMARIES_TABLE,
      values: [summaryRow],
      format: "JSONEachRow",
    });
  }

  async saveCheckpoint(params: {
    checkpoint: ReadCheckpoint;
  }): Promise<void> {
    const checkpointRow = this.buildCheckpointRow(params.checkpoint);

    this.logger.trace("Saving materialization checkpoint to ClickHouse", {
      userId: params.checkpoint.userId,
      traceId: params.checkpoint.traceId,
    });

    const client = this.getClient();

    await client.insert({
      table: CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
      values: [checkpointRow],
      format: "JSONEachRow",
    });
  }

  private buildReadNodeRows(nodes: ReadNode[]): ReadNodeRow[] {
    return nodes.map((node): ReadNodeRow => ({
      id: node.id,
      user_id: node.userId,
      trace_id: node.traceId,
      node_type: node.nodeType,
      data: node.data,
      started_at_ms: node.startedAt,
      ended_at_ms: node.endedAt,
      start_message: node.startMessage,
      end_message: node.endMessage,
      importance_level: node.importanceLevel,
      flow_order: node.flowOrder,
      materialized_at_ms: node.materializedAt,
    }));
  }

  private buildReadEdgeRows(edges: ReadEdge[]): ReadEdgeRow[] {
    return edges.map((edge): ReadEdgeRow => ({
      id: edge.id,
      user_id: edge.userId,
      trace_id: edge.traceId,
      edge_type: edge.edgeType,
      from_node_id: edge.fromNodeId,
      to_node_id: edge.toNodeId,
      from_flow_order: edge.fromFlowOrder,
      to_flow_order: edge.toFlowOrder,
      data: edge.data,
      started_at_ms: edge.startedAt,
      ended_at_ms: edge.endedAt,
      materialized_at_ms: edge.materializedAt,
    }));
  }

  private buildTraceSummaryRow(summary: ReadTraceSummary): TraceSummaryRow {
    return {
      user_id: summary.userId,
      trace_id: summary.traceId,
      node_count: summary.nodeCount,
      edge_count: summary.edgeCount,
      min_importance_level: summary.minImportanceLevel,
      max_importance_level: summary.maxImportanceLevel,
      started_at_ms: summary.startedAt,
      ended_at_ms: summary.endedAt,
      materialized_at_ms: summary.materializedAt,
      diagnostic_missing_starts_count: summary.diagMissingStarts,
      diagnostic_missing_ends_count: summary.diagMissingEnds,
      diagnostic_negative_duration_count: summary.diagNegativeDurations,
      diagnostic_cycle_count: summary.diagCycles,
      diagnostic_orphan_edge_count: summary.diagOrphanEdges,
      diagnostic_invalid_importance_count: summary.diagInvalidImportance,
      diagnostic_clock_skew_count: summary.diagClockSkew,
    };
  }

  private buildCheckpointRow(checkpoint: ReadCheckpoint): ReadCheckpointRow {
    return {
      user_id: checkpoint.userId,
      trace_id: checkpoint.traceId,
      node_progress_timestamp: checkpoint.lastNodeEventTime,
      node_progress_id: checkpoint.lastNodeEventId,
      node_progress_event_type: checkpoint.lastNodeEventType,
      edge_progress_timestamp: checkpoint.lastEdgeEventTime,
      edge_progress_id: checkpoint.lastEdgeEventId,
      edge_progress_event_type: checkpoint.lastEdgeEventType,
      updated_at_ms: checkpoint.checkpointedAt,
    };
  }
}

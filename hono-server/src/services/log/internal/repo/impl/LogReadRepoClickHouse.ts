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
  private readonly getClient: () => Pick<ClickHouseClient, "insert" | "query">;

  constructor(
    parentLogger: Logger<unknown>,
    getClient: () => Pick<ClickHouseClient, "insert" | "query"> = getInitializedClickHouseClient,
  ) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "LogReadRepoClickHouse",
    });
    this.getClient = getClient;
  }

  async loadCheckpoint(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null> {
    const client = this.getClient();
    const result = await client.query({
      query: `
        SELECT * FROM ${CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE}
        WHERE user_id = {userId:String} AND trace_id = {traceId:String}
        ORDER BY updated_at_ms DESC
        LIMIT 1
      `,
      format: "JSONEachRow",
      params: {
        userId: params.userId,
        traceId: params.traceId,
      },
    });

    const rows = await result.json<ReadCheckpointRow>();
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      userId: row.user_id,
      traceId: row.trace_id,
      lastNodeEventTime: row.node_progress_timestamp,
      lastNodeEventId: row.node_progress_id,
      lastNodeEventType: row.node_progress_event_type,
      lastEdgeEventTime: row.edge_progress_timestamp,
      lastEdgeEventId: row.edge_progress_id,
      lastEdgeEventType: row.edge_progress_event_type,
      checkpointedAt: row.updated_at_ms,
    };
  }

  async loadLatestReadModel(params: {
    userId: string;
    traceId: string;
  }): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }> {
    const client = this.getClient();
    const commonParams = { userId: params.userId, traceId: params.traceId };

    const [nodesResult, edgesResult, summaryResult] = await Promise.all([
      client.query({
        query: `
          SELECT 
            id,
            argMax(user_id, materialized_at_ms) as user_id,
            argMax(trace_id, materialized_at_ms) as trace_id,
            argMax(node_type, materialized_at_ms) as node_type,
            argMax(data, materialized_at_ms) as data,
            argMax(started_at_ms, materialized_at_ms) as started_at_ms,
            argMax(ended_at_ms, materialized_at_ms) as ended_at_ms,
            argMax(start_message, materialized_at_ms) as start_message,
            argMax(end_message, materialized_at_ms) as end_message,
            argMax(importance_level, materialized_at_ms) as importance_level,
            argMax(flow_order, materialized_at_ms) as flow_order,
            max(materialized_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_READ_NODES_TABLE}
          WHERE user_id = {userId:String} AND trace_id = {traceId:String}
          GROUP BY id
        `,
        format: "JSONEachRow",
        params: commonParams,
      }),
      client.query({
        query: `
          SELECT 
            id,
            argMax(user_id, materialized_at_ms) as user_id,
            argMax(trace_id, materialized_at_ms) as trace_id,
            argMax(edge_type, materialized_at_ms) as edge_type,
            argMax(from_node_id, materialized_at_ms) as from_node_id,
            argMax(to_node_id, materialized_at_ms) as to_node_id,
            argMax(from_flow_order, materialized_at_ms) as from_flow_order,
            argMax(to_flow_order, materialized_at_ms) as to_flow_order,
            argMax(data, materialized_at_ms) as data,
            argMax(started_at_ms, materialized_at_ms) as started_at_ms,
            argMax(ended_at_ms, materialized_at_ms) as ended_at_ms,
            max(materialized_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_READ_EDGES_TABLE}
          WHERE user_id = {userId:String} AND trace_id = {traceId:String}
          GROUP BY id
        `,
        format: "JSONEachRow",
        params: commonParams,
      }),
      client.query({
        query: `
          SELECT * FROM ${CLICKHOUSE_TRACE_SUMMARIES_TABLE}
          WHERE user_id = {userId:String} AND trace_id = {traceId:String}
          ORDER BY materialized_at_ms DESC
          LIMIT 1
        `,
        format: "JSONEachRow",
        params: commonParams,
      }),
    ]);

    const [nodeRows, edgeRows, summaryRows] = await Promise.all([
      nodesResult.json<ReadNodeRow>(),
      edgesResult.json<ReadEdgeRow>(),
      summaryResult.json<TraceSummaryRow>(),
    ]);

    return {
      nodes: nodeRows.map(row => ({
        id: row.id,
        userId: row.user_id,
        traceId: row.trace_id,
        nodeType: row.node_type,
        data: row.data,
        startedAt: row.started_at_ms,
        endedAt: row.ended_at_ms,
        startMessage: row.start_message,
        endMessage: row.end_message,
        importanceLevel: row.importance_level,
        flowOrder: row.flow_order,
        materializedAt: row.materialized_at_ms,
      })),
      edges: edgeRows.map(row => ({
        id: row.id,
        userId: row.user_id,
        traceId: row.trace_id,
        edgeType: row.edge_type,
        fromNodeId: row.from_node_id,
        toNodeId: row.to_node_id,
        fromFlowOrder: row.from_flow_order,
        toFlowOrder: row.to_flow_order,
        data: row.data,
        startedAt: row.started_at_ms,
        endedAt: row.ended_at_ms,
        materializedAt: row.materialized_at_ms,
      })),
      summary: summaryRows.length > 0 ? {
        userId: summaryRows[0].user_id,
        traceId: summaryRows[0].trace_id,
        nodeCount: summaryRows[0].node_count,
        edgeCount: summaryRows[0].edge_count,
        minImportanceLevel: summaryRows[0].min_importance_level,
        maxImportanceLevel: summaryRows[0].max_importance_level,
        startedAt: summaryRows[0].started_at_ms,
        endedAt: summaryRows[0].ended_at_ms,
        materializedAt: summaryRows[0].materialized_at_ms,
        diagMissingStarts: summaryRows[0].diagnostic_missing_starts_count,
        diagMissingEnds: summaryRows[0].diagnostic_missing_ends_count,
        diagNegativeDurations: summaryRows[0].diagnostic_negative_duration_count,
        diagCycles: summaryRows[0].diagnostic_cycle_count,
        diagOrphanEdges: summaryRows[0].diagnostic_orphan_edge_count,
        diagInvalidImportance: summaryRows[0].diagnostic_invalid_importance_count,
        diagClockSkew: summaryRows[0].diagnostic_clock_skew_count,
      } : null,
    };
  }
async loadRawEventsAfterCheckpoint(params: {
  userId: string;
  traceId: string;
  checkpoint: ReadCheckpoint | null;
}): Promise<{
  nodeEvents: NodeEventRow[];
  edgeEvents: EdgeEventRow[];
}> {
  const client = this.getClient();
  const nodeCheckpoint = params.checkpoint || {
    lastNodeEventTime: 0,
    lastNodeEventId: "",
    lastNodeEventType: 0,
  };
  const edgeCheckpoint = params.checkpoint || {
    lastEdgeEventTime: 0,
    lastEdgeEventId: "",
    lastEdgeEventType: 0,
  };

  const [nodeResult, edgeResult] = await Promise.all([
    client.query({
      query: `
        SELECT * FROM node_events
        WHERE user_id = {userId:String} AND trace_id = {traceId:String}
        AND tuple(if(event_type = 0, assumeNotNull(started_at_ms), assumeNotNull(ended_at_ms)), id, event_type) > 
            tuple({lastNodeEventTime:UInt64}, {lastNodeEventId:String}, {lastNodeEventType:UInt8})
        ORDER BY if(event_type = 0, assumeNotNull(started_at_ms), assumeNotNull(ended_at_ms)), id, event_type
      `,
      format: "JSONEachRow",
      params: {
        userId: params.userId,
        traceId: params.traceId,
        lastNodeEventTime: nodeCheckpoint.lastNodeEventTime,
        lastNodeEventId: nodeCheckpoint.lastNodeEventId,
        lastNodeEventType: nodeCheckpoint.lastNodeEventType,
      },
    }),
    client.query({
      query: `
        SELECT * FROM edge_events
        WHERE user_id = {userId:String} AND trace_id = {traceId:String}
        AND tuple(if(event_type = 0, assumeNotNull(started_at_ms), assumeNotNull(ended_at_ms)), id, event_type) > 
            tuple({lastEdgeEventTime:UInt64}, {lastEdgeEventId:String}, {lastEdgeEventType:UInt8})
        ORDER BY if(event_type = 0, assumeNotNull(started_at_ms), assumeNotNull(ended_at_ms)), id, event_type
      `,
      format: "JSONEachRow",
      params: {
        userId: params.userId,
        traceId: params.traceId,
        lastEdgeEventTime: edgeCheckpoint.lastEdgeEventTime,
        lastEdgeEventId: edgeCheckpoint.lastEdgeEventId,
        lastEdgeEventType: edgeCheckpoint.lastEdgeEventType,
      },
    }),
  ]);

  return {
    nodeEvents: await nodeResult.json<NodeEventRow>(),
    edgeEvents: await edgeResult.json<EdgeEventRow>(),
  };
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

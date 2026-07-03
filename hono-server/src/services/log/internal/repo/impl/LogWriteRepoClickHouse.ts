import { Logger } from "tslog";
import type { ClickHouseClient } from "@clickhouse/client-web";
import {
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
  CLICKHOUSE_TRACE_EVENTS_TABLE,
  getInitializedClickHouseClient,
} from "../../../../../infra/db/clickhouse";
import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
  IngestTraceStart,
} from "../../../api/types";
import { ILogWriteRepo } from "../ILogWriteRepo";
import { EdgeEventRow, NodeEventRow, TraceEventRow } from "../types";

/**
 * ClickHouse implementation of the Log Write Repository.
 */
export class LogWriteRepoClickHouse extends ILogWriteRepo {
  readonly logger: Logger<unknown>;
  private readonly getClient: () => Pick<ClickHouseClient, "insert">;

  constructor(
    parentLogger: Logger<unknown>,
    getClient: () => Pick<ClickHouseClient, "insert"> = getInitializedClickHouseClient,
  ) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "LogWriteRepoClickHouse",
    });
    this.getClient = getClient;
  }

  private buildTraceRows(data: {
    userId: string;
    traceStarts: IngestTraceStart[];
  }): TraceEventRow[] {
    return data.traceStarts.map((trace): TraceEventRow => ({
      user_id: data.userId,
      trace_id: trace.traceId,
      event_type: 0, // 0 = Start
      name: trace.name ?? null,
      importance_labels: trace.importanceLabels ?? {},
      timestamp_ms: trace.timestamp,
    }));
  }

  /**
   * Translates Node start and end objects to NodeEventRow database shapes.
   */
  private buildNodeRows(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    nodeEnds: IngestNodeEnd[];
  }): NodeEventRow[] {
    return [
      ...data.nodeStarts.map((node): NodeEventRow => ({
        id: node.id,
        user_id: data.userId,
        trace_id: node.traceId,
        event_type: 0, // 0 = Start
        started_at_ms: node.startedAt,
        ended_at_ms: null,
        node_type: node.nodeType,
        data: node.data,
        message: node.startMessage ?? null,
        name: node.name ?? null,
        importance_level: node.importanceLevel,
        group_parent_id: node.groupParentId ?? null,
        layer_key: node.layer?.key ?? null,
        layer_label: node.layer?.label ?? null,
        layer_order: node.layer?.order ?? null,
      })),
      ...data.nodeEnds.map((node): NodeEventRow => ({
        id: node.id,
        user_id: data.userId,
        trace_id: node.traceId,
        event_type: 1, // 1 = End
        started_at_ms: null,
        ended_at_ms: node.endedAt,
        node_type: null,
        data: {},
        message: node.endMessage ?? null,
        name: null,
        importance_level: null,
        group_parent_id: null,
        layer_key: null,
        layer_label: null,
        layer_order: null,
      })),
    ];
  }

  /**
   * Translates Edge start and end objects to EdgeEventRow database shapes.
   */
  private buildEdgeRows(data: {
    userId: string;
    edgeStarts: IngestEdgeStart[];
    edgeEnds: IngestEdgeEnd[];
  }): EdgeEventRow[] {
    return [
      ...data.edgeStarts.map((edge): EdgeEventRow => ({
        id: edge.id,
        user_id: data.userId,
        trace_id: edge.traceId,
        event_type: 0, // 0 = Start
        started_at_ms: edge.startedAt,
        ended_at_ms: null,
        edge_type: edge.edgeType,
        from_node_id: edge.fromNodeId,
        to_node_id: edge.toNodeId,
        data: edge.data,
      })),
      ...data.edgeEnds.map((edge): EdgeEventRow => ({
        id: edge.id,
        user_id: data.userId,
        trace_id: edge.traceId,
        event_type: 1, // 1 = End
        started_at_ms: null,
        ended_at_ms: edge.endedAt,
        edge_type: null,
        from_node_id: null,
        to_node_id: null,
        data: {},
      })),
    ];
  }

  /**
   * Executes the ClickHouse insert query for the staged rows.
   */
  async ingestNodesNEdges(data: {
    userId: string;
    traceStarts: IngestTraceStart[];
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    const traceRows = this.buildTraceRows(data);
    const nodeRows = this.buildNodeRows(data);
    const edgeRows = this.buildEdgeRows(data);

    this.logger.trace("Prepared ClickHouse log event rows", {
      userId: data.userId,
      traceRows: traceRows.length,
      nodeRows: nodeRows.length,
      edgeRows: edgeRows.length,
    });

    const client = this.getClient();

    if (traceRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_TRACE_EVENTS_TABLE,
        values: traceRows,
        format: "JSONEachRow",
      });
    }

    if (nodeRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_NODE_EVENTS_TABLE,
        values: nodeRows,
        format: "JSONEachRow",
      });
    }

    if (edgeRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_EDGE_EVENTS_TABLE,
        values: edgeRows,
        format: "JSONEachRow",
      });
    }
  }
}

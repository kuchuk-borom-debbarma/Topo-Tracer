import { Logger } from "tslog";
import type { ClickHouseClient } from "@clickhouse/client-web";
import {
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
  getInitializedClickHouseClient,
} from "../../../../../infra/db/clickhouse";
import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
} from "../../../api/types";
import { ILogWriteRepo } from "../ILogWriteRepo";
import { EdgeEventRow, NodeEventRow } from "../types";

/**
 * ClickHouse implementation of the Log Write Repository.
 * Following code-base.md guidelines:
 * - Resides under internal/repo/impl.
 * - Restricts database client interaction and ClickHouse table names here.
 * - Formats/maps incoming DTO arrays into database-schema row types (snake_case).
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

  /**
   * Translates Node start and end objects to NodeEventRow database shapes.
   */
  private buildNodeRows(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    nodeEnds: IngestNodeEnd[];
  }): NodeEventRow[] {
    return [
      // Start events carry node metadata captured when the node begins.
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
        importance_level: node.importanceLevel,
      })),
      // End events only carry completion data; start-only columns stay empty.
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
        importance_level: null,
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
      // Start events carry edge metadata captured when the edge begins.
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
      // End events only mark completion; edge type is start-only.
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
   * Executes the ClickHouse insert query for the staged node and edge rows.
   */
  async ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    const nodeRows = this.buildNodeRows(data);
    const edgeRows = this.buildEdgeRows(data);

    this.logger.trace("Prepared ClickHouse log event rows", {
      userId: data.userId,
      nodeRows: nodeRows.length,
      edgeRows: edgeRows.length,
    });

    const client = this.getClient();

    // Insert node events if present
    if (nodeRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_NODE_EVENTS_TABLE,
        values: nodeRows,
        format: "JSONEachRow",
      });
    }

    // Insert edge events if present
    if (edgeRows.length > 0) {
      await client.insert({
        table: CLICKHOUSE_EDGE_EVENTS_TABLE,
        values: edgeRows,
        format: "JSONEachRow",
      });
    }
  }
}


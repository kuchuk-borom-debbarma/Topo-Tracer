import { Logger } from "tslog";
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

export class LogWriteRepoClickHouse extends ILogWriteRepo {
  readonly logger: Logger<unknown>;

  constructor(parentLogger: Logger<unknown>) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "LogWriteRepoClickHouse",
    });
  }

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
        event_type: 0,
        timestamp_ms: node.startedAt,
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
        event_type: 1,
        timestamp_ms: node.endedAt,
        node_type: null,
        data: {},
        message: node.endMessage ?? null,
        importance_level: null,
      })),
    ];
  }

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
        event_type: 0,
        timestamp_ms: edge.startedAt,
        edge_type: edge.edgeType,
      })),
      // End events only mark completion; edge type is start-only.
      ...data.edgeEnds.map((edge): EdgeEventRow => ({
        id: edge.id,
        user_id: data.userId,
        trace_id: edge.traceId,
        event_type: 1,
        timestamp_ms: edge.endedAt,
        edge_type: null,
      })),
    ];
  }

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

    const client = getInitializedClickHouseClient();

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

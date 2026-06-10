import { Logger } from "tslog";
import type { ClickHouseClient } from "@clickhouse/client-web";
import {
  CLICKHOUSE_READ_NODES_TABLE,
  CLICKHOUSE_READ_EDGES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE,
  getInitializedClickHouseClient,
} from "../../../../../infra/db/clickhouse";
import {
  ReadCheckpoint,
  ReadNode,
  ReadEdge,
  ReadTraceSummary,
  BoundedVisibleEdgesResult,
  PagingParams,
  PagedResult,
} from "../../../api/types";
import { ILogReadRepo, DEFAULT_PROJECTION_EDGE_CAP } from "../ILogReadRepo";
import { ReadNodeRow, ReadEdgeRow, TraceSummaryRow, ReadCheckpointRow, NodeEventRow, EdgeEventRow } from "../types";

/**
 * ClickHouse implementation of the Log Read Repository.
 * Following code-base.md guidelines:
 * - Resides under internal/repo/impl.
 * - Handles execution of ClickHouse SQL query syntax.
 * - Uses argMax aggregation operators because read-optimized tables are backed by ReplacingMergeTree engines.
 * - Maps snake_case database rows back into camelCase module types.
 */
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

  /**
   * Retrieves the latest materialization checkpoint record for a trace from ClickHouse.
   */
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
      format: "JSON",
      query_params: {
        userId: params.userId,
        traceId: params.traceId,
      },
    });

    const jsonRes = await result.json<any>();
    const rows = (Array.isArray(jsonRes) ? jsonRes : (jsonRes.data || [])) as ReadCheckpointRow[];
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0]!;
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

  /**
   * Loads the latest materialized elements (nodes, edges, and summary) for a trace.
   * Resolves them concurrently using argMax grouping queries to collapse duplicate records.
   */
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

    const [nodesResult, edgesResult, summary] = await Promise.all([
      client.query({
        query: `
          SELECT 
            id,
            argMax(n.user_id, n.materialized_at_ms) as user_id,
            argMax(n.trace_id, n.materialized_at_ms) as trace_id,
            argMax(n.node_type, n.materialized_at_ms) as node_type,
            argMax(n.data, n.materialized_at_ms) as data,
            argMax(n.started_at_ms, n.materialized_at_ms) as started_at_ms,
            argMax(n.ended_at_ms, n.materialized_at_ms) as ended_at_ms,
            argMax(n.original_started_at_ms, n.materialized_at_ms) as original_started_at_ms,
            argMax(n.clock_skew_ms, n.materialized_at_ms) as clock_skew_ms,
            argMax(n.start_message, n.materialized_at_ms) as start_message,
            argMax(n.end_message, n.materialized_at_ms) as end_message,
            argMax(n.importance_level, n.materialized_at_ms) as importance_level,
            argMax(n.flow_order, n.materialized_at_ms) as flow_order,
            max(n.materialized_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_READ_NODES_TABLE} as n
          WHERE n.user_id = {userId:String} AND n.trace_id = {traceId:String}
          GROUP BY id
        `,
        format: "JSON",
        query_params: commonParams,
      }),
      client.query({
        query: `
          SELECT 
            id,
            argMax(e.user_id, e.materialized_at_ms) as user_id,
            argMax(e.trace_id, e.materialized_at_ms) as trace_id,
            argMax(e.edge_type, e.materialized_at_ms) as edge_type,
            argMax(e.from_node_id, e.materialized_at_ms) as from_node_id,
            argMax(e.to_node_id, e.materialized_at_ms) as to_node_id,
            argMax(e.from_flow_order, e.materialized_at_ms) as from_flow_order,
            argMax(e.to_flow_order, e.materialized_at_ms) as to_flow_order,
            argMax(e.data, e.materialized_at_ms) as data,
            argMax(e.started_at_ms, e.materialized_at_ms) as started_at_ms,
            argMax(e.ended_at_ms, e.materialized_at_ms) as ended_at_ms,
            argMax(e.original_started_at_ms, e.materialized_at_ms) as original_started_at_ms,
            argMax(e.clock_skew_ms, e.materialized_at_ms) as clock_skew_ms,
            max(e.materialized_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_READ_EDGES_TABLE} as e
          WHERE e.user_id = {userId:String} AND e.trace_id = {traceId:String}
          GROUP BY id
        `,
        format: "JSON",
        query_params: commonParams,
      }),
      this.loadTraceSummary(params),
    ]);

    const [nodesJson, edgesJson] = await Promise.all([
      nodesResult.json<any>(),
      edgesResult.json<any>(),
    ]);

    const nodeRows = (Array.isArray(nodesJson) ? nodesJson : (nodesJson.data || [])) as ReadNodeRow[];
    const edgeRows = (Array.isArray(edgesJson) ? edgesJson : (edgesJson.data || [])) as ReadEdgeRow[];

    return {
      nodes: nodeRows.map(row => ({
        id: row.id,
        userId: row.user_id,
        traceId: row.trace_id,
        nodeType: row.node_type,
        data: row.data,
        startedAt: row.started_at_ms,
        endedAt: row.ended_at_ms,
        originalStartedAt: row.original_started_at_ms,
        clockSkewMs: row.clock_skew_ms,
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
        originalStartedAt: row.original_started_at_ms,
        clockSkewMs: row.clock_skew_ms,
        materializedAt: row.materialized_at_ms,
      })),
      summary,
    };
  }

  /**
   * Replays/loads all raw events appended since the provided checkpoint.
   * Employs tuple-based inequality sorting to query new records correctly.
   */
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
        format: "JSON",
        query_params: {
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
        format: "JSON",
        query_params: {
          userId: params.userId,
          traceId: params.traceId,
          lastEdgeEventTime: edgeCheckpoint.lastEdgeEventTime,
          lastEdgeEventId: edgeCheckpoint.lastEdgeEventId,
          lastEdgeEventType: edgeCheckpoint.lastEdgeEventType,
        },
      }),
    ]);

    const [nodesJson, edgesJson] = await Promise.all([
      nodeResult.json<any>(),
      edgeResult.json<any>(),
    ]);

    return {
      nodeEvents: (Array.isArray(nodesJson) ? nodesJson : (nodesJson.data || [])) as NodeEventRow[],
      edgeEvents: (Array.isArray(edgesJson) ? edgesJson : (edgesJson.data || [])) as EdgeEventRow[],
    };
  }

  /**
   * Loads materialized nodes from ClickHouse filtered by importance threshold.
   * Supports sliding-window paging using flow_order offset.
   */
  async loadBoundedVisibleNodes(params: {
    userId: string;
    traceId: string;
    threshold: number;
    paging: PagingParams;
  }): Promise<PagedResult<ReadNode>> {
    const limit = Math.min(params.paging.limit, 1000);
    const offset = params.paging.offset;

    const client = this.getClient();
    const result = await client.query({
      query: `
        SELECT *, count(*) OVER() as total_node_count FROM (
          SELECT * FROM (
            SELECT 
              id,
              argMax(n.user_id, n.materialized_at_ms) as user_id,
              argMax(n.trace_id, n.materialized_at_ms) as trace_id,
              argMax(n.node_type, n.materialized_at_ms) as node_type,
              argMax(n.data, n.materialized_at_ms) as data,
              argMax(n.started_at_ms, n.materialized_at_ms) as started_at_ms,
              argMax(n.ended_at_ms, n.materialized_at_ms) as ended_at_ms,
              argMax(n.original_started_at_ms, n.materialized_at_ms) as original_started_at_ms,
              argMax(n.clock_skew_ms, n.materialized_at_ms) as clock_skew_ms,
              argMax(n.start_message, n.materialized_at_ms) as start_message,
              argMax(n.end_message, n.materialized_at_ms) as end_message,
              argMax(n.importance_level, n.materialized_at_ms) as importance_level,
              argMax(n.flow_order, n.materialized_at_ms) as flow_order,
              max(n.materialized_at_ms) as materialized_at_ms
            FROM ${CLICKHOUSE_READ_NODES_TABLE} as n
            WHERE n.user_id = {userId:String} AND n.trace_id = {traceId:String}
            GROUP BY id
          )
          WHERE importance_level <= {threshold:Int32}
        )
        WHERE flow_order >= {offset:UInt32}
        ORDER BY flow_order ASC, id ASC
        LIMIT {limit:UInt32}
      `,
      format: "JSON",
      query_params: {
        userId: params.userId,
        traceId: params.traceId,
        threshold: params.threshold,
        offset: offset,
        limit: limit + 1,
      },
    });

    const jsonRes = await result.json<any>();
    const rows = (Array.isArray(jsonRes) ? jsonRes : (jsonRes.data || [])) as (ReadNodeRow & { total_node_count: number })[];
    const hasMore = rows.length > limit;
    const finalRows = hasMore ? rows.slice(0, limit) : rows;
    const totalCount = rows.length > 0 ? Number(rows[0]!.total_node_count) : 0;

    const nodes: ReadNode[] = finalRows.map(row => ({
      id: row.id,
      userId: row.user_id,
      traceId: row.trace_id,
      nodeType: row.node_type,
      data: row.data,
      startedAt: row.started_at_ms,
      endedAt: row.ended_at_ms,
      originalStartedAt: row.original_started_at_ms,
      clockSkewMs: row.clock_skew_ms,
      startMessage: row.start_message,
      endMessage: row.end_message,
      importanceLevel: row.importance_level,
      flowOrder: row.flow_order,
      materializedAt: row.materialized_at_ms,
    }));

    return {
      items: nodes,
      totalCount,
      hasMore,
    };
  }

  /**
   * Loads materialized edges that connect to or from any node in the visible nodes list.
   * Employs the DEFAULT_PROJECTION_EDGE_CAP safety boundary.
   */
  async loadBoundedVisibleEdges(params: {
    userId: string;
    traceId: string;
    nodeIds: string[];
  }): Promise<BoundedVisibleEdgesResult> {
    if (params.nodeIds.length === 0) {
      return {
        edges: [],
        cap: {
          cap: DEFAULT_PROJECTION_EDGE_CAP,
          returnedCount: 0,
          capHit: false,
        },
      };
    }

    const client = this.getClient();
    const result = await client.query({
      query: `
        SELECT * FROM (
          SELECT 
            id,
            argMax(e.user_id, e.materialized_at_ms) as user_id,
            argMax(e.trace_id, e.materialized_at_ms) as trace_id,
            argMax(e.edge_type, e.materialized_at_ms) as edge_type,
            argMax(e.from_node_id, e.materialized_at_ms) as from_node_id,
            argMax(e.to_node_id, e.materialized_at_ms) as to_node_id,
            argMax(e.from_flow_order, e.materialized_at_ms) as from_flow_order,
            argMax(e.to_flow_order, e.materialized_at_ms) as to_flow_order,
            argMax(e.data, e.materialized_at_ms) as data,
            argMax(e.started_at_ms, e.materialized_at_ms) as started_at_ms,
            argMax(e.ended_at_ms, e.materialized_at_ms) as ended_at_ms,
            argMax(e.original_started_at_ms, e.materialized_at_ms) as original_started_at_ms,
            argMax(e.clock_skew_ms, e.materialized_at_ms) as clock_skew_ms,
            max(e.materialized_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_READ_EDGES_TABLE} as e
          WHERE e.user_id = {userId:String} AND e.trace_id = {traceId:String}
          GROUP BY id
        )
        WHERE has({nodeIds:Array(String)}, from_node_id) OR has({nodeIds:Array(String)}, to_node_id)
        ORDER BY least(from_flow_order, to_flow_order) ASC, id ASC
        LIMIT {limit:UInt32}
      `,
      format: "JSON",
      query_params: {
        userId: params.userId,
        traceId: params.traceId,
        nodeIds: params.nodeIds,
        limit: DEFAULT_PROJECTION_EDGE_CAP + 1,
      },
    });

    const jsonRes = await result.json<any>();
    const rows = (Array.isArray(jsonRes) ? jsonRes : (jsonRes.data || [])) as ReadEdgeRow[];
    const capHit = rows.length > DEFAULT_PROJECTION_EDGE_CAP;
    const finalRows = capHit ? rows.slice(0, DEFAULT_PROJECTION_EDGE_CAP) : rows;

    const edges: ReadEdge[] = finalRows.map(row => ({
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
      originalStartedAt: row.original_started_at_ms,
      clockSkewMs: row.clock_skew_ms,
      materializedAt: row.materialized_at_ms,
    }));

    return {
      edges,
      cap: {
        cap: DEFAULT_PROJECTION_EDGE_CAP,
        returnedCount: edges.length,
        capHit,
      },
    };
  }

  /**
   * Loads all nodes for a trace up to the safety cap in paging.
   * Supports sliding-window paging using flow_order offset.
   */
  async loadBoundedProjectionNodes(params: {
    userId: string;
    traceId: string;
    paging: PagingParams;
  }): Promise<PagedResult<ReadNode>> {
    const limit = Math.min(params.paging.limit, 1000);
    const offset = params.paging.offset;

    const client = this.getClient();
    const result = await client.query({
      query: `
        SELECT *, count(*) OVER() as total_node_count FROM (
          SELECT 
            id,
            argMax(n.user_id, n.materialized_at_ms) as user_id,
            argMax(n.trace_id, n.materialized_at_ms) as trace_id,
            argMax(n.node_type, n.materialized_at_ms) as node_type,
            argMax(n.data, n.materialized_at_ms) as data,
            argMax(n.started_at_ms, n.materialized_at_ms) as started_at_ms,
            argMax(n.ended_at_ms, n.materialized_at_ms) as ended_at_ms,
            argMax(n.original_started_at_ms, n.materialized_at_ms) as original_started_at_ms,
            argMax(n.clock_skew_ms, n.materialized_at_ms) as clock_skew_ms,
            argMax(n.start_message, n.materialized_at_ms) as start_message,
            argMax(n.end_message, n.materialized_at_ms) as end_message,
            argMax(n.importance_level, n.materialized_at_ms) as importance_level,
            argMax(n.flow_order, n.materialized_at_ms) as flow_order,
            max(n.materialized_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_READ_NODES_TABLE} as n
          WHERE n.user_id = {userId:String} AND n.trace_id = {traceId:String}
          GROUP BY id
        )
        WHERE flow_order >= {offset:UInt32}
        ORDER BY flow_order ASC, id ASC
        LIMIT {limit:UInt32}
      `,
      format: "JSON",
      query_params: {
        userId: params.userId,
        traceId: params.traceId,
        offset: offset,
        limit: limit + 1,
      },
    });

    const jsonRes = await result.json<any>();
    const rows = (Array.isArray(jsonRes) ? jsonRes : (jsonRes.data || [])) as (ReadNodeRow & { total_node_count: number })[];
    const hasMore = rows.length > limit;
    const finalRows = hasMore ? rows.slice(0, limit) : rows;
    const totalCount = rows.length > 0 ? Number(rows[0]!.total_node_count) : 0;

    const nodes: ReadNode[] = finalRows.map(row => ({
      id: row.id,
      userId: row.user_id,
      traceId: row.trace_id,
      nodeType: row.node_type,
      data: row.data,
      startedAt: row.started_at_ms,
      endedAt: row.ended_at_ms,
      originalStartedAt: row.original_started_at_ms,
      clockSkewMs: row.clock_skew_ms,
      startMessage: row.start_message,
      endMessage: row.end_message,
      importanceLevel: row.importance_level,
      flowOrder: row.flow_order,
      materializedAt: row.materialized_at_ms,
    }));

    return {
      items: nodes,
      totalCount,
      hasMore,
    };
  }

  /**
   * Loads the latest summary for a trace from ClickHouse.
   */
  // fallow-ignore-next-line complexity
  async loadTraceSummary(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadTraceSummary | null> {
    const client = this.getClient();
    const commonParams = {
      userId: params.userId,
      traceId: params.traceId,
    };

    // Query both the real-time aggregated table and the worker-computed diagnostics table concurrently
    const [rtResult, workerResult] = await Promise.all([
      client.query({
        query: `
          SELECT
            user_id,
            trace_id,
            sum(node_count) as node_count,
            sum(edge_count) as edge_count,
            min(min_importance_level) as min_importance_level,
            max(max_importance_level) as max_importance_level,
            min(started_at_ms) as started_at_ms,
            max(ended_at_ms) as ended_at_ms,
            max(updated_at_ms) as materialized_at_ms
          FROM ${CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE}
          WHERE user_id = {userId:String} AND trace_id = {traceId:String}
          GROUP BY user_id, trace_id
        `,
        format: "JSON",
        query_params: commonParams,
      }),
      client.query({
        query: `
          SELECT * FROM ${CLICKHOUSE_TRACE_SUMMARIES_TABLE}
          WHERE user_id = {userId:String} AND trace_id = {traceId:String}
          ORDER BY materialized_at_ms DESC
          LIMIT 1
        `,
        format: "JSON",
        query_params: commonParams,
      }),
    ]);

    const [rtJson, workerJson] = await Promise.all([
      rtResult.json<any>(),
      workerResult.json<any>(),
    ]);

    const rtRows = (Array.isArray(rtJson) ? rtJson : (rtJson.data || [])) as any[];
    const workerRows = (Array.isArray(workerJson) ? workerJson : (workerJson.data || [])) as TraceSummaryRow[];

    if (rtRows.length === 0 && workerRows.length === 0) {
      return null;
    }

    const rtRow = rtRows[0];
    const workerRow = workerRows[0];

    // Build the hybrid result, prioritizing real-time ingestion counts/bounds
    return {
      userId: params.userId,
      traceId: params.traceId,
      nodeCount: rtRow ? Number(rtRow.node_count) : (workerRow ? workerRow.node_count : 0),
      edgeCount: rtRow ? Number(rtRow.edge_count) : (workerRow ? workerRow.edge_count : 0),
      minImportanceLevel: rtRow && rtRow.min_importance_level !== null ? Number(rtRow.min_importance_level) : (workerRow ? workerRow.min_importance_level : 0),
      maxImportanceLevel: rtRow && rtRow.max_importance_level !== null ? Number(rtRow.max_importance_level) : (workerRow ? workerRow.max_importance_level : 0),
      startedAt: rtRow && rtRow.started_at_ms !== null ? Number(rtRow.started_at_ms) : (workerRow ? Number(workerRow.started_at_ms) : 0),
      endedAt: rtRow && rtRow.ended_at_ms !== null ? Number(rtRow.ended_at_ms) : (workerRow && workerRow.ended_at_ms !== null ? Number(workerRow.ended_at_ms) : null),
      materializedAt: rtRow && rtRow.materialized_at_ms !== null ? Number(rtRow.materialized_at_ms) : (workerRow ? Number(workerRow.materialized_at_ms) : Date.now()),
      
      // Diagnostics are supplied by the asynchronous worker
      diagMissingStarts: workerRow ? workerRow.diagnostic_missing_starts_count : 0,
      diagMissingEnds: workerRow ? workerRow.diagnostic_missing_ends_count : 0,
      diagNegativeDurations: workerRow ? workerRow.diagnostic_negative_duration_count : 0,
      diagCycles: workerRow ? workerRow.diagnostic_cycle_count : 0,
      diagOrphanEdges: workerRow ? workerRow.diagnostic_orphan_edge_count : 0,
      diagInvalidImportance: workerRow ? workerRow.diagnostic_invalid_importance_count : 0,
      diagClockSkew: workerRow ? workerRow.diagnostic_clock_skew_count : 0,
      diagLimitExceeded: workerRow ? workerRow.diagnostic_limit_exceeded_count : 0,
    };
  }

  /**
   * Saves the fully materialized trace components (nodes, edges, summary) into the read-optimized tables.
   */
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

    const BATCH_SIZE = 100;

    if (nodeRows.length > 0) {
      for (let i = 0; i < nodeRows.length; i += BATCH_SIZE) {
        const batch = nodeRows.slice(i, i + BATCH_SIZE);
        await client.insert({
          table: CLICKHOUSE_READ_NODES_TABLE,
          values: batch,
          format: "JSONEachRow",
        });
      }
    }

    if (edgeRows.length > 0) {
      for (let i = 0; i < edgeRows.length; i += BATCH_SIZE) {
        const batch = edgeRows.slice(i, i + BATCH_SIZE);
        await client.insert({
          table: CLICKHOUSE_READ_EDGES_TABLE,
          values: batch,
          format: "JSONEachRow",
        });
      }
    }

    await client.insert({
      table: CLICKHOUSE_TRACE_SUMMARIES_TABLE,
      values: [summaryRow],
      format: "JSONEachRow",
    });
  }

  /**
   * Updates/saves progress offsets for trace rebuilds.
   */
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
      original_started_at_ms: node.originalStartedAt,
      clock_skew_ms: node.clockSkewMs,
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
      original_started_at_ms: edge.originalStartedAt,
      clock_skew_ms: edge.clockSkewMs,
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
      diagnostic_limit_exceeded_count: summary.diagLimitExceeded,
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

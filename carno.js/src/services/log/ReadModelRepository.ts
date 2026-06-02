import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../infra/ClickHouseService";
import type { TraceReadModelStore } from "./contracts";
import type {
  GhostNode,
  GraphEdge,
  GraphProjectionResult,
  ReadEdge,
  ReadNode,
  TraceListResponse,
  TraceSummary,
} from "./types";

const LATEST_NODES_SQL = `
  SELECT
    trace_id,
    id,
    argMax(parent_id, materialized_at_ms) AS parent_id,
    argMax(name, materialized_at_ms) AS name,
    argMax(importance_level, materialized_at_ms) AS importance_level,
    argMax(status, materialized_at_ms) AS status,
    argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
    argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
    argMax(duration_ms, materialized_at_ms) AS duration_ms,
    argMax(ancestry_path, materialized_at_ms) AS ancestry_path,
    argMax(indent_level, materialized_at_ms) AS indent_level,
    argMax(flow_order, materialized_at_ms) AS flow_order,
    argMax(diagnostics, materialized_at_ms) AS diagnostics,
    argMax(data, materialized_at_ms) AS data,
    max(materialized_at_ms) AS latest_materialized_at_ms
  FROM topo_tracer.node_read_nodes
  WHERE trace_id = {traceId:String}
  GROUP BY trace_id, id
`;

const LATEST_EDGES_SQL = `
  SELECT
    trace_id,
    id,
    argMax(from_node_id, materialized_at_ms) AS from_node_id,
    argMax(to_node_id, materialized_at_ms) AS to_node_id,
    argMax(label, materialized_at_ms) AS label,
    argMax(status, materialized_at_ms) AS status,
    argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
    argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
    argMax(duration_ms, materialized_at_ms) AS duration_ms,
    argMax(diagnostics, materialized_at_ms) AS diagnostics,
    argMax(data, materialized_at_ms) AS data,
    max(materialized_at_ms) AS latest_materialized_at_ms
  FROM topo_tracer.node_read_edges
  WHERE trace_id = {traceId:String}
  GROUP BY trace_id, id
`;

const PROJECTED_GRAPH_STATS_SQL = `
  WITH
    latest_nodes AS (${LATEST_NODES_SQL}),
    visible_ids AS (
      SELECT groupUniqArray(id) AS ids
      FROM latest_nodes
      WHERE importance_level <= {maxImportance:Int32}
    ),
    classified_nodes AS (
      SELECT
        importance_level,
        if(nearest_visible_ancestor_id = '', '__root__', nearest_visible_ancestor_id) AS ghost_key
      FROM (
        SELECT
          latest_nodes.importance_level,
          arrayFirst(
            ancestor_id -> has(visible_ids.ids, ancestor_id),
            arrayReverse(latest_nodes.ancestry_path)
          ) AS nearest_visible_ancestor_id
        FROM latest_nodes
        CROSS JOIN visible_ids
      )
    )
  SELECT
    countIf(importance_level > {maxImportance:Int32}) AS hidden_node_count,
    uniqExactIf(ghost_key, importance_level > {maxImportance:Int32}) AS ghost_node_count,
    countIf(importance_level <= {maxImportance:Int32}) +
      uniqExactIf(ghost_key, importance_level > {maxImportance:Int32}) AS projected_node_count
  FROM classified_nodes
`;

const PROJECTED_GRAPH_NODES_SQL = `
  WITH
    latest_nodes AS (${LATEST_NODES_SQL}),
    visible_ids AS (
      SELECT groupUniqArray(id) AS ids
      FROM latest_nodes
      WHERE importance_level <= {maxImportance:Int32}
    ),
    hidden_nodes AS (
      SELECT
        *,
        if(nearest_visible_ancestor_id = '', '__root__', nearest_visible_ancestor_id) AS ghost_key
      FROM (
        SELECT
          latest_nodes.*,
          arrayFirst(
            ancestor_id -> has(visible_ids.ids, ancestor_id),
            arrayReverse(latest_nodes.ancestry_path)
          ) AS nearest_visible_ancestor_id
        FROM latest_nodes
        CROSS JOIN visible_ids
        WHERE latest_nodes.importance_level > {maxImportance:Int32}
      )
    ),
    hidden_groups AS (
      SELECT
        ghost_key,
        any(trace_id) AS trace_id,
        count() AS hidden_node_count,
        countIf(status = 'error') AS hidden_error_count,
        multiIf(
          countIf(status = 'error') > 0, 'error',
          countIf(status = 'warning') > 0, 'warning',
          'ok'
        ) AS group_status,
        min(started_at_ms) AS started_at_ms,
        max(ended_at_ms) AS ended_at_ms,
        min(flow_order) AS flow_order,
        groupArray(25)(id) AS hidden_node_ids,
        greatest(toInt64(count()) - 25, 0) AS truncated_hidden_node_ids
      FROM hidden_nodes
      GROUP BY ghost_key
    ),
    projected_nodes AS (
      SELECT
        'node' AS row_kind,
        trace_id,
        id,
        parent_id,
        name,
        importance_level,
        status,
        started_at_ms,
        ended_at_ms,
        duration_ms,
        ancestry_path,
        indent_level,
        toFloat64(flow_order) AS flow_order,
        diagnostics,
        data,
        toUInt8(0) AS is_ghost,
        toUInt64(0) AS hidden_node_count,
        toUInt64(0) AS hidden_error_count,
        CAST(NULL, 'Nullable(Int64)') AS hidden_duration_ms,
        emptyArrayString() AS hidden_node_ids,
        toInt64(0) AS truncated_hidden_node_ids
      FROM latest_nodes
      WHERE importance_level <= {maxImportance:Int32}

      UNION ALL

      SELECT
        'ghost' AS row_kind,
        hidden_groups.trace_id AS trace_id,
        concat('ghost:', hidden_groups.ghost_key) AS id,
        nullIf(hidden_groups.ghost_key, '__root__') AS parent_id,
        concat(
          toString(hidden_groups.hidden_node_count),
          ' hidden less-important node',
          if(hidden_groups.hidden_node_count = 1, '', 's')
        ) AS name,
        {maxImportance:Int32} + 1 AS importance_level,
        hidden_groups.group_status AS status,
        hidden_groups.started_at_ms AS started_at_ms,
        hidden_groups.ended_at_ms AS ended_at_ms,
        if(
          isNull(hidden_groups.started_at_ms) OR isNull(hidden_groups.ended_at_ms),
          NULL,
          hidden_groups.ended_at_ms - hidden_groups.started_at_ms
        ) AS duration_ms,
        if(
          hidden_groups.ghost_key = '__root__',
          emptyArrayString(),
          arrayConcat(parent.ancestry_path, [parent.id])
        ) AS ancestry_path,
        if(hidden_groups.ghost_key = '__root__', 0, parent.indent_level + 1) AS indent_level,
        toFloat64(hidden_groups.flow_order) + 0.1 AS flow_order,
        emptyArrayString() AS diagnostics,
        '' AS data,
        toUInt8(1) AS is_ghost,
        hidden_groups.hidden_node_count AS hidden_node_count,
        hidden_groups.hidden_error_count AS hidden_error_count,
        if(
          isNull(hidden_groups.started_at_ms) OR isNull(hidden_groups.ended_at_ms),
          NULL,
          hidden_groups.ended_at_ms - hidden_groups.started_at_ms
        ) AS hidden_duration_ms,
        hidden_groups.hidden_node_ids AS hidden_node_ids,
        hidden_groups.truncated_hidden_node_ids AS truncated_hidden_node_ids
      FROM hidden_groups
      LEFT JOIN latest_nodes AS parent
        ON parent.trace_id = hidden_groups.trace_id
        AND parent.id = hidden_groups.ghost_key
    )
  SELECT
    row_kind,
    trace_id,
    id,
    parent_id,
    name,
    importance_level,
    status,
    started_at_ms,
    ended_at_ms,
    duration_ms,
    ancestry_path,
    indent_level,
    flow_order,
    diagnostics,
    data,
    is_ghost,
    hidden_node_count,
    hidden_error_count,
    hidden_duration_ms,
    hidden_node_ids,
    truncated_hidden_node_ids
  FROM projected_nodes
  ORDER BY flow_order ASC, id ASC
  LIMIT {limit:UInt32} OFFSET {offset:UInt32}
`;

const PROJECTED_GRAPH_EDGES_SQL = `
  WITH
    latest_nodes AS (${LATEST_NODES_SQL}),
    visible_ids AS (
      SELECT groupUniqArray(id) AS ids
      FROM latest_nodes
      WHERE importance_level <= {maxImportance:Int32}
    ),
    latest_edges AS (${LATEST_EDGES_SQL}),
    resolved_edges AS (
      SELECT
        *,
        if(resolved_from != from_node_id OR resolved_to != to_node_id, toUInt8(1), toUInt8(0)) AS is_ghost_edge
      FROM (
        SELECT
          edge_with_ancestors.*,
          if(
            edge_with_ancestors.from_importance_level <= {maxImportance:Int32},
            edge_with_ancestors.from_node_id,
            concat(
              'ghost:',
              if(from_nearest_visible_ancestor_id = '', '__root__', from_nearest_visible_ancestor_id)
            )
          ) AS resolved_from,
          if(
            edge_with_ancestors.to_importance_level <= {maxImportance:Int32},
            edge_with_ancestors.to_node_id,
            concat(
              'ghost:',
              if(to_nearest_visible_ancestor_id = '', '__root__', to_nearest_visible_ancestor_id)
            )
          ) AS resolved_to
        FROM (
          SELECT
            latest_edges.trace_id AS edge_trace_id,
            latest_edges.id AS edge_source_id,
            latest_edges.from_node_id AS from_node_id,
            latest_edges.to_node_id AS to_node_id,
            latest_edges.label AS label,
            latest_edges.status AS edge_row_status,
            latest_edges.started_at_ms AS edge_started_at_ms,
            latest_edges.ended_at_ms AS edge_ended_at_ms,
            latest_edges.duration_ms AS edge_duration_ms,
            latest_edges.diagnostics AS edge_diagnostics,
            latest_edges.data AS edge_data,
            from_node.importance_level AS from_importance_level,
            to_node.importance_level AS to_importance_level,
            arrayFirst(
              ancestor_id -> has(visible_ids.ids, ancestor_id),
              arrayReverse(from_node.ancestry_path)
            ) AS from_nearest_visible_ancestor_id,
            arrayFirst(
              ancestor_id -> has(visible_ids.ids, ancestor_id),
              arrayReverse(to_node.ancestry_path)
            ) AS to_nearest_visible_ancestor_id
          FROM latest_edges
          INNER JOIN latest_nodes AS from_node
            ON from_node.trace_id = latest_edges.trace_id
            AND from_node.id = latest_edges.from_node_id
          INNER JOIN latest_nodes AS to_node
            ON to_node.trace_id = latest_edges.trace_id
            AND to_node.id = latest_edges.to_node_id
          CROSS JOIN visible_ids
        ) AS edge_with_ancestors
      )
      WHERE
        has({nodeIds:Array(String)}, resolved_from)
        AND has({nodeIds:Array(String)}, resolved_to)
        AND resolved_from != resolved_to
    ),
    grouped_edges AS (
      SELECT
        if(
          max(is_ghost_edge) = 1,
          concat('ghost-edge:', resolved_from, '->', resolved_to, ':', label),
          any(edge_source_id)
        ) AS edge_id,
        any(edge_trace_id) AS grouped_trace_id,
        resolved_from AS edge_from_node_id,
        resolved_to AS edge_to_node_id,
        label AS edge_label,
        multiIf(
          countIf(edge_row_status = 'error') > 0, 'error',
          countIf(edge_row_status = 'warning') > 0, 'warning',
          countIf(edge_row_status = 'open') > 0, 'open',
          'ok'
        ) AS edge_status,
        min(edge_started_at_ms) AS min_started_at_ms,
        max(edge_ended_at_ms) AS max_ended_at_ms,
        if(
          isNull(min(edge_started_at_ms)) OR isNull(max(edge_ended_at_ms)),
          NULL,
          max(edge_ended_at_ms) - min(edge_started_at_ms)
        ) AS edge_duration_ms,
        arrayDistinct(arrayFlatten(groupArray(edge_diagnostics))) AS grouped_diagnostics,
        any(edge_data) AS grouped_data,
        max(is_ghost_edge) AS edge_is_ghost,
        if(max(is_ghost_edge) = 1, count(), 0) AS edge_hidden_edge_count
      FROM resolved_edges
      GROUP BY resolved_from, resolved_to, label
    )
  SELECT
    edge_id AS id,
    grouped_trace_id AS trace_id,
    edge_from_node_id AS from_node_id,
    edge_to_node_id AS to_node_id,
    edge_label AS label,
    edge_status AS status,
    min_started_at_ms AS started_at_ms,
    max_ended_at_ms AS ended_at_ms,
    edge_duration_ms AS duration_ms,
    grouped_diagnostics AS diagnostics,
    grouped_data AS data,
    edge_is_ghost AS is_ghost,
    edge_hidden_edge_count AS hidden_edge_count
  FROM grouped_edges
`;

@Service()
export class ReadModelRepository implements TraceReadModelStore {
  constructor(private clickhouse: ClickHouseService) {}

  async saveTraceReadModel(input: {
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: TraceSummary;
  }): Promise<void> {
    const materializedAtUnixMs = input.summary.materializedAtUnixMs;

    if (input.nodes.length) {
      await this.clickhouse.client.insert({
        table: "topo_tracer.node_read_nodes",
        values: input.nodes.map((node) => ({
          trace_id: node.traceId,
          id: node.id,
          parent_id: node.parentId,
          name: node.name,
          importance_level: node.importanceLevel,
          status: node.status,
          started_at_ms: node.startedAtUnixMs,
          ended_at_ms: node.endedAtUnixMs,
          duration_ms: node.durationMs,
          ancestry_path: node.ancestryPath,
          indent_level: node.indentLevel,
          flow_order: node.flowOrder,
          diagnostics: node.diagnostics,
          data: JSON.stringify(node.data),
          materialized_at_ms: materializedAtUnixMs,
        })),
        format: "JSONEachRow",
      });
    }

    if (input.edges.length) {
      await this.clickhouse.client.insert({
        table: "topo_tracer.node_read_edges",
        values: input.edges.map((edge) => ({
          trace_id: edge.traceId,
          id: edge.id,
          from_node_id: edge.fromNodeId,
          to_node_id: edge.toNodeId,
          label: edge.label,
          status: edge.status,
          started_at_ms: edge.startedAtUnixMs,
          ended_at_ms: edge.endedAtUnixMs,
          duration_ms: edge.durationMs,
          diagnostics: edge.diagnostics,
          data: JSON.stringify(edge.data),
          materialized_at_ms: materializedAtUnixMs,
        })),
        format: "JSONEachRow",
      });
    }

    await this.clickhouse.client.insert({
      table: "topo_tracer.node_trace_summary",
      values: [{
        trace_id: input.summary.traceId,
        created_at_ms: input.summary.createdAtUnixMs,
        updated_at_ms: input.summary.updatedAtUnixMs,
        node_count: input.summary.nodeCount,
        edge_count: input.summary.edgeCount,
        error_count: input.summary.errorCount,
        diagnostic_count: input.summary.diagnosticCount,
        max_importance_level: input.summary.maxImportanceLevel,
        materialized_at_ms: input.summary.materializedAtUnixMs,
      }],
      format: "JSONEachRow",
    });
  }

  async getSummary(traceId: string): Promise<TraceSummary | null> {
    const rows = await this.queryRows<any>(`
      SELECT
        trace_id,
        created_at_ms,
        updated_at_ms,
        node_count,
        edge_count,
        error_count,
        diagnostic_count,
        max_importance_level,
        latest_materialized_at_ms AS materialized_at_ms
      FROM (
        SELECT
          trace_id,
          argMax(created_at_ms, materialized_at_ms) AS created_at_ms,
          argMax(updated_at_ms, materialized_at_ms) AS updated_at_ms,
          argMax(node_count, materialized_at_ms) AS node_count,
          argMax(edge_count, materialized_at_ms) AS edge_count,
          argMax(error_count, materialized_at_ms) AS error_count,
          argMax(diagnostic_count, materialized_at_ms) AS diagnostic_count,
          argMax(max_importance_level, materialized_at_ms) AS max_importance_level,
          max(materialized_at_ms) AS latest_materialized_at_ms
        FROM topo_tracer.node_trace_summary
        WHERE trace_id = {traceId:String}
        GROUP BY trace_id
      )
    `, { traceId });
    return rows[0] ? mapSummary(rows[0]) : null;
  }

  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    const offset = (page - 1) * limit;
    const [traces, totals] = await Promise.all([
      this.queryRows<any>(`
        SELECT
          trace_id,
          created_at_ms,
          updated_at_ms,
          node_count,
          edge_count,
          error_count,
          diagnostic_count,
          max_importance_level,
          latest_materialized_at_ms AS materialized_at_ms
        FROM (
          SELECT
            trace_id,
            argMax(created_at_ms, materialized_at_ms) AS created_at_ms,
            argMax(updated_at_ms, materialized_at_ms) AS updated_at_ms,
            argMax(node_count, materialized_at_ms) AS node_count,
            argMax(edge_count, materialized_at_ms) AS edge_count,
            argMax(error_count, materialized_at_ms) AS error_count,
            argMax(diagnostic_count, materialized_at_ms) AS diagnostic_count,
            argMax(max_importance_level, materialized_at_ms) AS max_importance_level,
            max(materialized_at_ms) AS latest_materialized_at_ms
          FROM topo_tracer.node_trace_summary
          GROUP BY trace_id
        )
        ORDER BY updated_at_ms DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `, { limit, offset }),
      this.queryRows<{ total: string | number }>(`
        SELECT uniqExact(trace_id) AS total
        FROM topo_tracer.node_trace_summary
      `),
    ]);

    const total = totals[0] ? Number(totals[0].total) : 0;
    return {
      traces: traces.map(mapSummary),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getProjectedGraph(input: {
    traceId: string;
    maxImportance: number;
    limit: number;
    offset: number;
  }): Promise<GraphProjectionResult> {
    const params = {
      traceId: input.traceId,
      maxImportance: input.maxImportance,
      limit: input.limit,
      offset: input.offset,
    };

    const [stats] = await this.queryRows<any>(PROJECTED_GRAPH_STATS_SQL, params);
    const nodes = (await this.queryRows<any>(PROJECTED_GRAPH_NODES_SQL, params)).map(mapProjectedNode);
    const nodeIds = nodes.map((node) => node.id);
    const edges = nodeIds.length
      ? (await this.queryRows<any>(PROJECTED_GRAPH_EDGES_SQL, { ...params, nodeIds })).map(mapGraphEdge)
      : [];

    return {
      nodes,
      edges,
      hiddenNodeCount: stats ? Number(stats.hidden_node_count) : 0,
      ghostNodeCount: stats ? Number(stats.ghost_node_count) : 0,
      projectedNodeCount: stats ? Number(stats.projected_node_count) : 0,
    };
  }

  private async queryRows<T>(query: string, queryParams?: Record<string, unknown>): Promise<T[]> {
    const result = await this.clickhouse.client.query({
      query,
      query_params: queryParams,
      format: "JSONEachRow",
    });
    return result.json<T>();
  }
}

function mapSummary(row: any): TraceSummary {
  return {
    traceId: row.trace_id,
    createdAtUnixMs: Number(row.created_at_ms),
    updatedAtUnixMs: Number(row.updated_at_ms),
    nodeCount: Number(row.node_count),
    edgeCount: Number(row.edge_count),
    errorCount: Number(row.error_count),
    diagnosticCount: Number(row.diagnostic_count),
    maxImportanceLevel: Number(row.max_importance_level),
    materializedAtUnixMs: Number(row.materialized_at_ms),
  };
}

function mapNode(row: any): ReadNode {
  return {
    id: row.id,
    traceId: row.trace_id,
    parentId: row.parent_id ?? null,
    name: row.name,
    importanceLevel: Number(row.importance_level),
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    ancestryPath: row.ancestry_path ?? [],
    indentLevel: Number(row.indent_level),
    flowOrder: Number(row.flow_order),
    diagnostics: row.diagnostics ?? [],
    data: parseJson(row.data),
  };
}

function mapProjectedNode(row: any): ReadNode | GhostNode {
  if (Number(row.is_ghost) !== 1) return mapNode(row);

  const hiddenNodeIds = Array.isArray(row.hidden_node_ids) ? row.hidden_node_ids : [];
  const truncatedHiddenNodeIds = Math.max(0, Number(row.truncated_hidden_node_ids ?? 0));
  const hiddenNodeCount = Number(row.hidden_node_count ?? 0);

  return {
    id: row.id,
    traceId: row.trace_id,
    parentId: row.parent_id ?? null,
    name: row.name,
    importanceLevel: Number(row.importance_level),
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    ancestryPath: row.ancestry_path ?? [],
    indentLevel: Number(row.indent_level),
    flowOrder: Number(row.flow_order),
    diagnostics: row.diagnostics ?? [],
    data: {
      summary: "Collapsed by importance slider",
      hiddenNodeIds,
      truncatedHiddenNodeIds,
    },
    isGhost: true,
    hiddenNodeCount,
    hiddenErrorCount: Number(row.hidden_error_count ?? 0),
    hiddenDurationMs: nullableNumber(row.hidden_duration_ms),
  };
}

function mapEdge(row: any): ReadEdge {
  return {
    id: row.id,
    traceId: row.trace_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    label: row.label,
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    diagnostics: row.diagnostics ?? [],
    data: parseJson(row.data),
  };
}

function mapGraphEdge(row: any): GraphEdge {
  const edge = mapEdge(row) as GraphEdge;
  const isGhost = Number(row.is_ghost ?? 0) === 1;
  const hiddenEdgeCount = Number(row.hidden_edge_count ?? 0);
  if (isGhost) edge.isGhost = true;
  if (hiddenEdgeCount > 0) edge.hiddenEdgeCount = hiddenEdgeCount;
  return edge;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

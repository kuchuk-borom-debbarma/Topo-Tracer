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
    argMax(name, materialized_at_ms) AS name,
    argMax(importance_level, materialized_at_ms) AS importance_level,
    argMax(status, materialized_at_ms) AS status,
    argMax(started_at_ms, materialized_at_ms) AS started_at_ms,
    argMax(ended_at_ms, materialized_at_ms) AS ended_at_ms,
    argMax(duration_ms, materialized_at_ms) AS duration_ms,
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

const HIDDEN_NODE_ID = "ghost:hidden";

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
          name: node.name,
          importance_level: node.importanceLevel,
          status: node.status,
          started_at_ms: node.startedAtUnixMs,
          ended_at_ms: node.endedAtUnixMs,
          duration_ms: node.durationMs,
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

    const allNodes = (await this.queryRows<any>(`
      ${LATEST_NODES_SQL}
      ORDER BY flow_order ASC, id ASC
    `, { traceId: input.traceId })).map(mapNode);
    const allEdges = (await this.queryRows<any>(LATEST_EDGES_SQL, { traceId: input.traceId })).map(mapEdge);
    const visibleNodes = allNodes.filter((node) => node.importanceLevel <= input.maxImportance);
    const hiddenNodes = allNodes.filter((node) => node.importanceLevel > input.maxImportance);
    const projectedNodes = hiddenNodes.length
      ? [...visibleNodes, createHiddenGhostNode(input.traceId, input.maxImportance, hiddenNodes)]
      : visibleNodes;
    projectedNodes.sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id));

    const nodes = projectedNodes.slice(input.offset, input.offset + input.limit);
    const edges = projectEdges(allEdges, allNodes, nodes, input.maxImportance);

    return {
      nodes,
      edges,
      hiddenNodeCount: hiddenNodes.length,
      ghostNodeCount: hiddenNodes.length ? 1 : 0,
      projectedNodeCount: projectedNodes.length,
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
    name: row.name,
    importanceLevel: Number(row.importance_level),
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    flowOrder: Number(row.flow_order),
    diagnostics: row.diagnostics ?? [],
    data: parseJson(row.data),
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

function createHiddenGhostNode(traceId: string, maxImportance: number, hiddenNodes: ReadNode[]): GhostNode {
  const started = numericValues(hiddenNodes.map((node) => node.startedAtUnixMs));
  const ended = numericValues(hiddenNodes.map((node) => node.endedAtUnixMs));
  const startedAtUnixMs = started.length ? Math.min(...started) : null;
  const endedAtUnixMs = ended.length ? Math.max(...ended) : null;
  const hiddenNodeIds = hiddenNodes.slice(0, 25).map((node) => node.id);
  const hiddenErrorCount = hiddenNodes.filter((node) => node.status === "error").length;
  const hasWarning = hiddenNodes.some((node) => node.status === "warning" || node.status === "open");

  return {
    id: HIDDEN_NODE_ID,
    traceId,
    name: `${hiddenNodes.length} hidden less-important node${hiddenNodes.length === 1 ? "" : "s"}`,
    importanceLevel: maxImportance + 1,
    status: hiddenErrorCount > 0 ? "error" : hasWarning ? "warning" : "ok",
    startedAtUnixMs,
    endedAtUnixMs,
    durationMs: startedAtUnixMs !== null && endedAtUnixMs !== null ? endedAtUnixMs - startedAtUnixMs : null,
    flowOrder: Math.min(...hiddenNodes.map((node) => node.flowOrder), Number.MAX_SAFE_INTEGER) + 0.1,
    diagnostics: [],
    data: {
      summary: "Collapsed by importance slider",
      hiddenNodeIds,
      truncatedHiddenNodeIds: Math.max(0, hiddenNodes.length - hiddenNodeIds.length),
    },
    isGhost: true,
    hiddenNodeCount: hiddenNodes.length,
    hiddenErrorCount,
    hiddenDurationMs: startedAtUnixMs !== null && endedAtUnixMs !== null ? endedAtUnixMs - startedAtUnixMs : null,
  };
}

function projectEdges(
  allEdges: ReadEdge[],
  allNodes: ReadNode[],
  projectedNodes: Array<ReadNode | GhostNode>,
  maxImportance: number,
): GraphEdge[] {
  const allNodeById = new Map(allNodes.map((node) => [node.id, node]));
  const projectedIds = new Set(projectedNodes.map((node) => node.id));
  const groups = new Map<string, GraphEdge & { sourceIds?: string[] }>();

  for (const edge of allEdges) {
    const from = allNodeById.get(edge.fromNodeId);
    const to = allNodeById.get(edge.toNodeId);
    if (!from || !to) continue;

    const resolvedFrom = from.importanceLevel <= maxImportance ? edge.fromNodeId : HIDDEN_NODE_ID;
    const resolvedTo = to.importanceLevel <= maxImportance ? edge.toNodeId : HIDDEN_NODE_ID;
    if (resolvedFrom === resolvedTo || !projectedIds.has(resolvedFrom) || !projectedIds.has(resolvedTo)) continue;

    const isGhost = resolvedFrom !== edge.fromNodeId || resolvedTo !== edge.toNodeId;
    if (!isGhost) {
      groups.set(edge.id, { ...edge });
      continue;
    }

    const key = `ghost-edge:${resolvedFrom}->${resolvedTo}:${edge.label}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...edge,
        id: key,
        fromNodeId: resolvedFrom,
        toNodeId: resolvedTo,
        isGhost: true,
        hiddenEdgeCount: 1,
        diagnostics: [...edge.diagnostics],
      });
      continue;
    }

    existing.hiddenEdgeCount = (existing.hiddenEdgeCount ?? 0) + 1;
    existing.status = mergeStatus(existing.status, edge.status);
    existing.startedAtUnixMs = minNullable(existing.startedAtUnixMs, edge.startedAtUnixMs);
    existing.endedAtUnixMs = maxNullable(existing.endedAtUnixMs, edge.endedAtUnixMs);
    existing.durationMs = existing.startedAtUnixMs !== null && existing.endedAtUnixMs !== null
      ? existing.endedAtUnixMs - existing.startedAtUnixMs
      : null;
    existing.diagnostics = Array.from(new Set([...existing.diagnostics, ...edge.diagnostics]));
  }

  return Array.from(groups.values()).sort((a, b) =>
    (a.startedAtUnixMs ?? Number.MAX_SAFE_INTEGER) - (b.startedAtUnixMs ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id)
  );
}

function numericValues(values: Array<number | null>): number[] {
  return values.filter((value): value is number => value !== null);
}

function mergeStatus(left: string, right: string): string {
  if (left === "error" || right === "error") return "error";
  if (left === "warning" || right === "warning") return "warning";
  if (left === "open" || right === "open") return "open";
  return "ok";
}

function minNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function maxNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
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

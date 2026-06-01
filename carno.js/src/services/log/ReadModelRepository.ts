import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../infra/ClickHouseService";
import type { ReadEdge, ReadNode, TraceListResponse, TraceSummary } from "./types";

@Service()
export class ReadModelRepository {
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

      const ancestryRows = input.nodes.flatMap((node) =>
        node.ancestryPath.map((ancestorId, ancestorDepth) => ({
          trace_id: node.traceId,
          node_id: node.id,
          ancestor_id: ancestorId,
          ancestor_depth: ancestorDepth,
          materialized_at_ms: materializedAtUnixMs,
        })),
      );
      if (ancestryRows.length) {
        await this.clickhouse.client.insert({
          table: "topo_tracer.node_read_node_ancestry",
          values: ancestryRows,
          format: "JSONEachRow",
        });
      }
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
      SELECT *
      FROM topo_tracer.node_trace_summary FINAL
      WHERE trace_id = {traceId:String}
      ORDER BY materialized_at_ms DESC
      LIMIT 1
    `, { traceId });
    return rows[0] ? mapSummary(rows[0]) : null;
  }

  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    const offset = (page - 1) * limit;
    const [traces, totals] = await Promise.all([
      this.queryRows<any>(`
        SELECT *
        FROM topo_tracer.node_trace_summary FINAL
        ORDER BY updated_at_ms DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.queryRows<{ total: string | number }>(`
        SELECT count() AS total
        FROM topo_tracer.node_trace_summary FINAL
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

  async getNodes(traceId: string): Promise<ReadNode[]> {
    const rows = await this.queryRows<any>(`
      SELECT *
      FROM topo_tracer.node_read_nodes FINAL
      WHERE trace_id = {traceId:String}
      ORDER BY flow_order ASC
    `, { traceId });
    return rows.map(mapNode);
  }

  async getEdges(traceId: string): Promise<ReadEdge[]> {
    const rows = await this.queryRows<any>(`
      SELECT *
      FROM topo_tracer.node_read_edges FINAL
      WHERE trace_id = {traceId:String}
    `, { traceId });
    return rows.map(mapEdge);
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

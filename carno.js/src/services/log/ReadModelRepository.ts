import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../infra/ClickHouseService";
import type {
  ReadContainer,
  ReadEdge,
  ReadNode,
  TraceListResponse,
  TraceSummary,
} from "./types";

@Service()
export class ReadModelRepository {
  constructor(private clickhouse: ClickHouseService) {}

  async saveTraceReadModel(input: {
    containers: ReadContainer[];
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: TraceSummary;
  }): Promise<void> {
    const materializedAtUnixMs = input.summary.materializedAtUnixMs;

    if (input.containers.length) {
      await this.clickhouse.client.insert({
        table: "topo_tracer.read_containers",
        values: input.containers.map((container) => ({
          trace_id: container.traceId,
          id: container.id,
          parent_id: container.parentId,
          name: container.name,
          kind: container.kind,
          status: container.status,
          started_at_ms: container.startedAtUnixMs,
          ended_at_ms: container.endedAtUnixMs,
          duration_ms: container.durationMs,
          ancestry_ids: container.ancestryIds,
          diagnostics: container.diagnostics,
          metadata: JSON.stringify(container.metadata),
          materialized_at_ms: materializedAtUnixMs,
        })),
        format: "JSONEachRow",
      });

      const containerAncestryRows = input.containers.flatMap((container) =>
        container.ancestryIds.map((ancestorId, depth) => ({
          trace_id: container.traceId,
          container_id: container.id,
          ancestor_id: ancestorId,
          depth,
          materialized_at_ms: materializedAtUnixMs,
        }))
      );
      if (containerAncestryRows.length) {
        await this.clickhouse.client.insert({
          table: "topo_tracer.read_container_ancestry",
          values: containerAncestryRows,
          format: "JSONEachRow",
        });
      }
    }

    if (input.nodes.length) {
      await this.clickhouse.client.insert({
        table: "topo_tracer.read_nodes",
        values: input.nodes.map((node) => ({
          trace_id: node.traceId,
          id: node.id,
          container_id: node.containerId,
          parent_id: node.parentId,
          name: node.name,
          kind: node.kind,
          status: node.status,
          started_at_ms: node.startedAtUnixMs,
          ended_at_ms: node.endedAtUnixMs,
          duration_ms: node.durationMs,
          ancestry_ids: node.ancestryIds,
          flow_order: node.flowOrder,
          diagnostics: node.diagnostics,
          metadata: JSON.stringify(node.metadata),
          materialized_at_ms: materializedAtUnixMs,
        })),
        format: "JSONEachRow",
      });

      const nodeAncestryRows = input.nodes.flatMap((node) =>
        node.ancestryIds.map((ancestorId, depth) => ({
          trace_id: node.traceId,
          node_id: node.id,
          ancestor_id: ancestorId,
          depth,
          materialized_at_ms: materializedAtUnixMs,
        }))
      );
      if (nodeAncestryRows.length) {
        await this.clickhouse.client.insert({
          table: "topo_tracer.read_node_ancestry",
          values: nodeAncestryRows,
          format: "JSONEachRow",
        });
      }
    }

    if (input.edges.length) {
      await this.clickhouse.client.insert({
        table: "topo_tracer.read_edges",
        values: input.edges.map((edge) => ({
          trace_id: edge.traceId,
          id: edge.id,
          from_id: edge.fromId,
          to_id: edge.toId,
          kind: edge.kind,
          status: edge.status,
          started_at_ms: edge.startedAtUnixMs,
          ended_at_ms: edge.endedAtUnixMs,
          duration_ms: edge.durationMs,
          diagnostics: edge.diagnostics,
          metadata: JSON.stringify(edge.metadata),
          materialized_at_ms: materializedAtUnixMs,
        })),
        format: "JSONEachRow",
      });
    }

    await this.clickhouse.client.insert({
      table: "topo_tracer.read_trace_summary",
      values: [{
        trace_id: input.summary.traceId,
        created_at_ms: input.summary.createdAtUnixMs,
        updated_at_ms: input.summary.updatedAtUnixMs,
        container_count: input.summary.containerCount,
        node_count: input.summary.nodeCount,
        edge_count: input.summary.edgeCount,
        error_count: input.summary.errorCount,
        diagnostic_count: input.summary.diagnosticCount,
        materialized_at_ms: input.summary.materializedAtUnixMs,
      }],
      format: "JSONEachRow",
    });
  }

  async getSummary(traceId: string): Promise<TraceSummary | null> {
    const rows = await this.queryRows<any>(`
      SELECT *
      FROM topo_tracer.read_trace_summary FINAL
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
        FROM topo_tracer.read_trace_summary FINAL
        ORDER BY updated_at_ms DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.queryRows<{ total: string | number }>(`
        SELECT count() AS total
        FROM topo_tracer.read_trace_summary FINAL
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

  async getContainers(traceId: string): Promise<ReadContainer[]> {
    const rows = await this.queryRows<any>(`
      SELECT *
      FROM topo_tracer.read_containers FINAL
      WHERE trace_id = {traceId:String}
    `, { traceId });
    return rows.map(mapContainer);
  }

  async getNodes(traceId: string): Promise<ReadNode[]> {
    const rows = await this.queryRows<any>(`
      SELECT *
      FROM topo_tracer.read_nodes FINAL
      WHERE trace_id = {traceId:String}
      ORDER BY flow_order ASC
    `, { traceId });
    return rows.map(mapNode);
  }

  async getEdges(traceId: string): Promise<ReadEdge[]> {
    const rows = await this.queryRows<any>(`
      SELECT *
      FROM topo_tracer.read_edges FINAL
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
    containerCount: Number(row.container_count),
    nodeCount: Number(row.node_count),
    edgeCount: Number(row.edge_count),
    errorCount: Number(row.error_count),
    diagnosticCount: Number(row.diagnostic_count),
    materializedAtUnixMs: Number(row.materialized_at_ms),
  };
}

function mapContainer(row: any): ReadContainer {
  return {
    id: row.id,
    traceId: row.trace_id,
    parentId: row.parent_id ?? null,
    name: row.name,
    kind: row.kind,
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    ancestryIds: row.ancestry_ids ?? [],
    diagnostics: row.diagnostics ?? [],
    metadata: safeJson(row.metadata),
  };
}

function mapNode(row: any): ReadNode {
  return {
    id: row.id,
    traceId: row.trace_id,
    containerId: row.container_id ?? null,
    parentId: row.parent_id ?? null,
    name: row.name,
    kind: row.kind,
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    ancestryIds: row.ancestry_ids ?? [],
    flowOrder: Number(row.flow_order),
    diagnostics: row.diagnostics ?? [],
    metadata: safeJson(row.metadata),
  };
}

function mapEdge(row: any): ReadEdge {
  return {
    id: row.id,
    traceId: row.trace_id,
    fromId: row.from_id,
    toId: row.to_id,
    kind: row.kind,
    status: row.status,
    startedAtUnixMs: nullableNumber(row.started_at_ms),
    endedAtUnixMs: nullableNumber(row.ended_at_ms),
    durationMs: nullableNumber(row.duration_ms),
    diagnostics: row.diagnostics ?? [],
    metadata: safeJson(row.metadata),
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}

function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

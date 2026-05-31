import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import { LogRepo } from "../LogRepo";
import type { 
  TraceSpan, 
  TraceEdge, 
  ReadSpan, 
  ReadEdge, 
  TraceListItem
} from "../../types";

@Service()
export class LogRepoClickHouseImpl extends LogRepo {
  constructor(private clickHouse: ClickHouseService) {
    super();
  }

  override async saveSpans(spans: TraceSpan[]): Promise<void> {
    if (!spans.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.raw_spans",
      values: spans.map(s => ({
        id: s.id,
        trace_id: s.traceId,
        parent_id: s.parentId ?? "",
        name: s.name,
        kind: s.kind,
        type: s.type,
        tags: s.tags,
        event_type: s.eventType,
        timestamp: s.timestamp.getTime(),
        level_names: s.levelNames || {},
      })),
      format: "JSONEachRow",
    });
  }

  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    if (!edges.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.raw_edges",
      values: edges.map(edge => ({
        id: edge.id,
        trace_id: edge.traceId,
        from_span_id: edge.fromSpanId,
        to_span_id: edge.toSpanId,
        type: edge.type,
        timestamp: edge.timestamp.getTime(),
      })),
      format: "JSONEachRow",
    });
  }

  override async fetchSpans(traceId: string): Promise<TraceSpan[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, parent_id as parentId, name, kind, type, tags, event_type as eventType, timestamp, level_names as levelNames FROM toco_tracer.raw_spans WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      timestamp: new Date(Number(r.timestamp)),
      parentId: r.parentId || null,
      levelNames: parseNumberMap(r.levelNames),
    }));
  }

  override async fetchRawEdges(traceId: string): Promise<TraceEdge[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, from_span_id as fromSpanId, to_span_id as toSpanId, type, timestamp FROM toco_tracer.raw_edges WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      timestamp: new Date(Number(r.timestamp)),
    }));
  }

  override async saveReadSpans(spans: ReadSpan[]): Promise<void> {
    if (!spans.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_spans",
      values: spans.map(s => ({
        id: s.id,
        trace_id: s.traceId,
        parent_id: s.parentId ?? "",
        name: s.name,
        kind: s.kind,
        type: s.type,
        tags: s.tags,
        parentage: s.parentage,
        view_level: s.viewLevel,
        local_sequence: s.localSequence,
        start_time_us: s.startTimeUs,
        duration_us: s.durationUs,
        metadata: stringifyJson(s.metadata),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveReadEdges(edges: ReadEdge[]): Promise<void> {
    if (!edges.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_edges",
      values: edges.map(e => ({
        id: e.id,
        trace_id: e.traceId,
        from_span_id: e.fromSpanId,
        to_span_id: e.toSpanId,
        type: e.type,
        distance: e.distance,
        metadata: stringifyJson(e.metadata),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveReadTrace(trace: { 
    traceId: string; 
    containerIds: string[]; 
    tags: string[]; 
    levelNames: Record<number, string>; 
    layoutJson: string; 
    createdAt: number; 
  }): Promise<void> {
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_traces",
      values: [{
        trace_id: trace.traceId,
        container_ids: trace.containerIds,
        tags: trace.tags,
        level_names: trace.levelNames,
        layout_json: trace.layoutJson,
        created_at: trace.createdAt,
      }],
      format: "JSONEachRow",
    });
  }

  override async fetchReadTraceMeta(traceId: string): Promise<{ levelNames: Record<number, string>; layoutJson: string } | null> {
    const result = await this.clickHouse.client.query({
      query: `SELECT level_names as levelNames, layout_json as layoutJson FROM toco_tracer.read_traces WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    if (!rows.length) return null;
    return {
      levelNames: parseNumberMap(rows[0].levelNames),
      layoutJson: rows[0].layoutJson,
    };
  }

  override async fetchReadSpans(traceId: string): Promise<ReadSpan[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, parent_id as parentId, name, kind, type, tags, parentage, view_level as viewLevel, local_sequence as localSequence, start_time_us as startTimeUs, duration_us as durationUs, metadata FROM toco_tracer.read_spans WHERE trace_id = {traceId: String} ORDER BY start_time_us ASC`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      parentId: r.parentId || null,
      viewLevel: Number(r.viewLevel),
      localSequence: Number(r.localSequence),
      startTimeUs: Number(r.startTimeUs),
      durationUs: r.durationUs !== null ? Number(r.durationUs) : null,
      metadata: r.metadata ? parseJson(r.metadata) : null,
    }));
  }

  override async fetchReadEdges(traceId: string): Promise<ReadEdge[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, from_span_id as fromSpanId, to_span_id as toSpanId, type, distance, metadata FROM toco_tracer.read_edges WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      distance: Number(r.distance),
      metadata: r.metadata ? parseJson(r.metadata) : null,
    }));
  }

  override async fetchTracesList(page: number, limit: number): Promise<TraceListItem[]> {
    const offset = (page - 1) * limit;
    const result = await this.clickHouse.client.query({
      query: `
        SELECT
          trace_id AS traceId,
          container_ids AS containerIds,
          tags,
          created_at AS createdAt
        FROM toco_tracer.read_traces
        ORDER BY created_at DESC
        LIMIT {limit: UInt32} OFFSET {offset: UInt32}
      `,
      query_params: { limit, offset },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    
    const traceIds = rows.map((r: any) => r.traceId);
    if (!traceIds.length) return [];

    const namesResult = await this.clickHouse.client.query({
      query: `
        SELECT trace_id as traceId, groupArray(name) as containerNames
        FROM toco_tracer.read_spans
        WHERE trace_id IN (${traceIds.map((id: string) => `'${id}'`).join(",")}) AND kind = 'boundary'
        GROUP BY trace_id
      `,
      format: "JSONEachRow",
    });
    const namesRows = await namesResult.json<any>();
    const namesMap = new Map<string, string[]>();
    for (const nr of namesRows) {
      namesMap.set(nr.traceId, nr.containerNames);
    }

    return rows.map((r: any) => ({
      traceId: r.traceId,
      createdAt: Number(r.createdAt),
      containerNames: namesMap.get(r.traceId) || [],
      tags: r.tags || [],
    }));
  }

  override async fetchTracesCount(): Promise<number> {
    const result = await this.clickHouse.client.query({
      query: `SELECT count(DISTINCT trace_id) AS total FROM toco_tracer.read_traces`,
      format: "JSONEachRow",
    });
    const rows = await result.json<{ total: number }>();
    return Number(rows[0]?.total ?? 0);
  }
}

function stringifyJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseNumberMap(value: any): Record<number, string> {
  if (!value) return {};
  const res: Record<number, string> = {};
  for (const [k, v] of Object.entries(value)) {
    res[Number(k)] = String(v);
  }
  return res;
}

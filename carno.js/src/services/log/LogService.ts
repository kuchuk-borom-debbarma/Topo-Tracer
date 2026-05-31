import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../infra/ClickHouseService";
import type { 
  TraceSpanInput, 
  TraceEdgeInput, 
  TraceLayoutResponse,
  TraceListResponse
} from "./types";

@Service()
export class LogService {
  constructor(private clickhouse: ClickHouseService) {}

  async logSpans(spans: TraceSpanInput[]): Promise<void> {
    if (!spans.length) return;
    
    const rows = spans.map(s => ({
      id: s.id,
      trace_id: s.traceId,
      name: s.name,
      group_name: s.groupName,
      level: s.level,
      tags: s.tags,
      event_type: s.eventType === "started" ? 1 : 2,
      timestamp: s.timestamp
    }));

    await this.clickhouse.client.insert({
      table: "toco_tracer.raw_spans",
      values: rows,
      format: "JSONEachRow"
    });
  }

  async logEdges(edges: TraceEdgeInput[]): Promise<void> {
    if (!edges.length) return;

    const rows = edges.map(e => ({
      id: e.id,
      trace_id: e.traceId,
      from_span_id: e.fromSpanId,
      to_span_id: e.toSpanId,
      timestamp: e.timestamp
    }));

    await this.clickhouse.client.insert({
      table: "toco_tracer.raw_edges",
      values: rows,
      format: "JSONEachRow"
    });
  }

  async getTraceLayout(traceId: string, maxLevel?: number): Promise<TraceLayoutResponse | null> { 
    // 1. Fetch Visible Spans
    let spansQuery = `SELECT * FROM toco_tracer.read_spans WHERE trace_id = '${traceId}'`;
    
    if (maxLevel !== undefined) {
      spansQuery += `
        AND (
          level <= ${maxLevel}
          OR level >= 50
          OR id IN (
            SELECT arrayJoin(ancestry_path) 
            FROM toco_tracer.read_spans 
            WHERE trace_id = '${traceId}' AND level >= 50
          )
        )
      `;
    }

    // 2. Fetch Edges with Ancestry
    const edgesQuery = `
      SELECT 
        e.id, 
        e.trace_id, 
        e.from_span_id, 
        e.to_span_id,
        s_from.ancestry_path as from_ancestry,
        s_to.ancestry_path as to_ancestry
      FROM toco_tracer.read_edges e
      LEFT JOIN toco_tracer.read_spans s_from ON e.from_span_id = s_from.id
      LEFT JOIN toco_tracer.read_spans s_to ON e.to_span_id = s_to.id
      WHERE e.trace_id = '${traceId}'
    `;

    const [spansResult, edgesResult] = await Promise.all([
      this.clickhouse.client.query({ query: spansQuery, format: 'JSONEachRow' }),
      this.clickhouse.client.query({ query: edgesQuery, format: 'JSONEachRow' })
    ]);

    const spans = await spansResult.json<any>();
    if (spans.length === 0) return null;

    const rawEdges = await edgesResult.json<any>();

    // Build visible spans map for fast lookup
    const visibleSpansMap = new Set(spans.map((s: any) => s.id));

    // 3. Resolve Edges (The Ghost Router)
    const edgeMap = new Map<string, any>();

    for (const edge of rawEdges) {
      let resolvedFromId = edge.from_span_id;
      let resolvedToId = edge.to_span_id;
      let isGhost = false;

      // Walk up ancestry if from_span_id is hidden
      if (!visibleSpansMap.has(resolvedFromId) && edge.from_ancestry) {
        const fromAncestry: string[] = edge.from_ancestry;
        let found = false;
        // Walk backwards (bottom-up)
        for (let i = fromAncestry.length - 1; i >= 0; i--) {
          if (visibleSpansMap.has(fromAncestry[i])) {
            resolvedFromId = fromAncestry[i];
            isGhost = true;
            found = true;
            break;
          }
        }
        // If dead-end (no visible ancestor), drop this edge
        if (!found) continue;
      }

      // Walk up ancestry if to_span_id is hidden
      if (!visibleSpansMap.has(resolvedToId) && edge.to_ancestry) {
        const toAncestry: string[] = edge.to_ancestry;
        let found = false;
        for (let i = toAncestry.length - 1; i >= 0; i--) {
          if (visibleSpansMap.has(toAncestry[i])) {
            resolvedToId = toAncestry[i];
            isGhost = true;
            found = true;
            break;
          }
        }
        // If dead-end, drop this edge
        if (!found) continue;
      }

      // Drop internal loops
      if (resolvedFromId === resolvedToId) continue;

      // 4. Group Ghost Edges
      const edgeKey = `${resolvedFromId}->${resolvedToId}`;
      if (edgeMap.has(edgeKey)) {
        const existing = edgeMap.get(edgeKey);
        if (isGhost) {
          existing.ghostCount = (existing.ghostCount || 1) + 1;
        }
      } else {
        edgeMap.set(edgeKey, {
          id: isGhost ? `ghost-${edgeKey}` : edge.id,
          traceId: traceId,
          fromSpanId: resolvedFromId,
          toSpanId: resolvedToId,
          isGhost: isGhost || undefined,
          ghostCount: isGhost ? 1 : undefined,
        });
      }
    }

    const resolvedEdges = Array.from(edgeMap.values());

    return {
      metadata: { traceId },
      spans: spans.map((s: any) => ({
        id: s.id,
        traceId: s.trace_id,
        name: s.name,
        groupName: s.group_name,
        level: s.level,
        tags: s.tags,
        startTimeUs: s.start_time_us ? Number(s.start_time_us) : 0,
        endTimeUs: s.end_time_us ? Number(s.end_time_us) : null,
        durationUs: s.duration_us ? Number(s.duration_us) : null,
        ancestryPath: s.ancestry_path || [],
      })),
      edges: resolvedEdges,
    };
  }

  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    // TODO: Implement listing traces
    return { traces: [], total: 0, page, limit, totalPages: 0 };
  }
}


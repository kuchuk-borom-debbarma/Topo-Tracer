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
    // TODO: Implement reading from read_spans and read_edges
    return null; 
  }

  async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    // TODO: Implement listing traces
    return { traces: [], total: 0, page, limit, totalPages: 0 };
  }
}


import { OnApplicationInit, Service } from "@carno.js/core";
import { ClickHouseService } from "../../../infra/ClickHouseService";

@Service()
export class TraceMaterializationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private clickhouse: ClickHouseService) {}

  @OnApplicationInit()
  start() {
    console.log("[TraceMaterializationWorker] Starting background worker...");
    this.timer = setInterval(() => this.processNewTraces(), 5000);
  }

  private async processNewTraces() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Find traces in raw_spans that don't have ANY rows in read_spans yet
      const query = `
        SELECT DISTINCT trace_id 
        FROM toco_tracer.raw_spans 
        WHERE trace_id NOT IN (
          SELECT DISTINCT trace_id FROM toco_tracer.read_spans
        )
      `;
      
      const resultSet = await this.clickhouse.client.query({ query, format: 'JSONEachRow' });
      const rows = await resultSet.json<{trace_id: string}>();
      
      for (const row of rows) {
        await this.materializeTrace(row.trace_id);
      }
    } catch (err) {
      console.error("[TraceMaterializationWorker] Error processing traces:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async materializeTrace(traceId: string) {
    console.log(`[TraceMaterializationWorker] Materializing trace ${traceId}...`);
    
    // Fetch raw spans and edges
    const spansQuery = `SELECT * FROM toco_tracer.raw_spans WHERE trace_id = '${traceId}'`;
    const edgesQuery = `SELECT * FROM toco_tracer.raw_edges WHERE trace_id = '${traceId}'`;

    const [spansResult, edgesResult] = await Promise.all([
      this.clickhouse.client.query({ query: spansQuery, format: 'JSONEachRow' }),
      this.clickhouse.client.query({ query: edgesQuery, format: 'JSONEachRow' })
    ]);

    const rawSpans = await spansResult.json<any>();
    const rawEdges = await edgesResult.json<any>();

    // If no spans, abort
    if (rawSpans.length === 0) return;

    // Merge started/ended events for spans
    const spanMap = new Map<string, any>();
    for (const s of rawSpans) {
      if (!spanMap.has(s.id)) {
        spanMap.set(s.id, {
          id: s.id,
          trace_id: s.trace_id,
          name: s.name,
          group_name: s.group_name,
          level: s.level,
          tags: s.tags,
          start_time_us: null,
          end_time_us: null,
        });
      }
      const span = spanMap.get(s.id)!;
      // 1 = started, 2 = ended
      if (s.event_type === 1) span.start_time_us = s.timestamp;
      else if (s.event_type === 2) span.end_time_us = s.timestamp;
    }

    // Graph building (Adjacency List: Parent -> Children)
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize all spans in graph
    for (const spanId of spanMap.keys()) {
      adjList.set(spanId, []);
      inDegree.set(spanId, 0);
    }

    // Build edges
    const readEdgesToInsert: any[] = [];
    for (const e of rawEdges) {
      readEdgesToInsert.push({
        id: e.id,
        trace_id: e.trace_id,
        from_span_id: e.from_span_id,
        to_span_id: e.to_span_id,
      });

      if (!adjList.has(e.from_span_id)) adjList.set(e.from_span_id, []);
      if (!inDegree.has(e.to_span_id)) inDegree.set(e.to_span_id, 0);

      adjList.get(e.from_span_id)!.push(e.to_span_id);
      inDegree.set(e.to_span_id, inDegree.get(e.to_span_id)! + 1);
    }

    // Find roots (in-degree 0)
    const roots = Array.from(inDegree.entries())
      .filter(([_, degree]) => degree === 0)
      .map(([id]) => id);

    // Compute ancestry via DFS
    const readSpansToInsert: any[] = [];
    
    const dfs = (nodeId: string, currentPath: string[]) => {
      const span = spanMap.get(nodeId);
      if (span) {
        let duration_us = null;
        if (span.start_time_us !== null && span.end_time_us !== null) {
          duration_us = span.end_time_us - span.start_time_us;
        }

        readSpansToInsert.push({
          ...span,
          duration_us,
          ancestry_path: currentPath
        });
      }

      const nextPath = [...currentPath, nodeId];
      const children = adjList.get(nodeId) || [];
      for (const child of children) {
        dfs(child, nextPath);
      }
    };

    // Edge case: if roots is empty but spanMap is not, there's a cycle (shouldn't happen in traces).
    // Or if graph is disconnected, we might have multiple roots.
    for (const root of roots) {
      dfs(root, []);
    }

    // Note: If some spans were disconnected and not roots (e.g., cyclic, which shouldn't happen), they wouldn't be inserted.
    // In tracing, it's typically a DAG.

    // Batch insert into read-optimized tables
    if (readSpansToInsert.length > 0) {
      await this.clickhouse.client.insert({
        table: "toco_tracer.read_spans",
        values: readSpansToInsert,
        format: "JSONEachRow"
      });
    }

    if (readEdgesToInsert.length > 0) {
      await this.clickhouse.client.insert({
        table: "toco_tracer.read_edges",
        values: readEdgesToInsert,
        format: "JSONEachRow"
      });
    }

    console.log(`[TraceMaterializationWorker] Inserted ${readSpansToInsert.length} spans and ${readEdgesToInsert.length} edges for trace ${traceId}.`);
  }
}

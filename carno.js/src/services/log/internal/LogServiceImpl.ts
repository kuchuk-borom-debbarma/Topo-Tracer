import { Service } from "@carno.js/core";
import { LogService } from "../LogService";
import type {
  TraceSpan,
  TraceSpanInput,
  TraceEdge,
  TraceEdgeInput,
  TraceLayoutResponse,
  TraceListResponse,
  ReadSpan,
  ReadEdge,
  GhostSpan,
} from "../types";
import { LogRepo } from "./LogRepo";
import { TraceMaterializationWorker } from "./worker/TraceMaterializationWorker";
import { v4 as uuidv4 } from "uuid";

@Service()
export class LogServiceImpl extends LogService {
  constructor(
    private logRepo: LogRepo,
    private worker?: TraceMaterializationWorker
  ) {
    super();
  }

  override async logSpans(spans: TraceSpanInput[]): Promise<void> {
    const enriched: TraceSpan[] = spans.map(span => ({
      ...span,
      timestamp: new Date(span.timestamp),
      levelNames: span.levelNames || {},
      viewLevel: span.viewLevel !== undefined ? span.viewLevel : 0,
    }));

    console.log(`[LogServiceImpl] Ingesting ${enriched.length} raw spans into ClickHouse...`);
    await this.logRepo.saveSpans(enriched);
    console.log(`[LogServiceImpl] Successfully saved ${enriched.length} raw spans to toco_tracer.raw_spans`);
    this.triggerTraces(spans);
  }

  override async logEdges(edges: TraceEdgeInput[]): Promise<void> {
    const enriched: TraceEdge[] = edges.map(edge => ({
      ...edge,
      timestamp: new Date(edge.timestamp),
    }));

    console.log(`[LogServiceImpl] Ingesting ${enriched.length} raw edges into ClickHouse...`);
    await this.logRepo.saveEdges(enriched);
    console.log(`[LogServiceImpl] Successfully saved ${enriched.length} raw edges to toco_tracer.raw_edges`);
    this.triggerTraces(edges);
  }

  override async getTraceLayout(traceId: string, maxLevel?: number): Promise<TraceLayoutResponse | null> {
    // 1. Fetch pre-calculated visual layout JSON metadata
    console.log(`[LogServiceImpl] Fetching pre-calculated trace layout for traceId: ${traceId}`);
    const meta = await this.logRepo.fetchReadTraceMeta(traceId);
    let levelNames: Record<number, string> = {};
    let spans: ReadSpan[] = [];
    let edges: ReadEdge[] = [];

    if (meta) {
      levelNames = meta.levelNames || {};
      console.log(`[LogServiceImpl] Found trace layout cache in read_traces (Level Names: ${JSON.stringify(levelNames)})`);
      try {
        const layout = JSON.parse(meta.layoutJson);
        spans = layout.spans || [];
        edges = layout.edges || [];
        console.log(`[LogServiceImpl] Parsed cached layout: ${spans.length} spans, ${edges.length} edges`);
      } catch (err) {
        console.error("[LogServiceImpl] Failed to parse layout JSON string, falling back to direct query:", err);
      }
    } else {
      console.log(`[LogServiceImpl] No layout cache found in read_traces table for traceId: ${traceId}`);
    }

    // Fallback: If cache is somehow empty, query read tables directly to remain robust
    if (spans.length === 0) {
      console.log(`[LogServiceImpl] Falling back to direct query from read_spans and read_edges tables for traceId: ${traceId}`);
      const [dbSpans, dbEdges] = await Promise.all([
        this.logRepo.fetchReadSpans(traceId),
        this.logRepo.fetchReadEdges(traceId),
      ]);
      spans = dbSpans;
      edges = dbEdges;
      console.log(`[LogServiceImpl] Fallback query loaded: ${spans.length} spans, ${edges.length} edges`);
    }

    if (spans.length === 0) {
      console.log(`[LogServiceImpl] Trace layout for traceId: ${traceId} is completely empty. Returning null.`);
      return null;
    }

    // 2. Perform Dynamic View-Level Filtering & Snappy Link Tunneling
    let finalSpans = spans;
    let finalEdges = edges;
    const ghostSpans: GhostSpan[] = [];

    if (maxLevel !== undefined) {
      console.log(`[LogServiceImpl] Filtering traceId ${traceId} dynamically using maxLevel = ${maxLevel}`);
      // Keep only spans that fit in the selected view Level
      finalSpans = spans.filter(s => s.viewLevel <= maxLevel);
      const visibleSpanIds = new Set(finalSpans.map(s => s.id));
      console.log(`[LogServiceImpl] Spans kept: ${finalSpans.length}/${spans.length} (Excluded: ${spans.length - finalSpans.length})`);

      const resolveAnchor = (spanId: string): ReadSpan | null => {
        const cs = spans.find(x => x.id === spanId);
        if (!cs) return null;

        // Walk backwards along parentage to find the closest visible ancestor span
        for (const ancestorId of [...cs.parentage].reverse()) {
          if (visibleSpanIds.has(ancestorId)) {
            const found = spans.find(x => x.id === ancestorId);
            if (found) return found;
          }
        }
        return null;
      };

      const snappedEdges: ReadEdge[] = [];
      const seenConnections = new Set<string>();

      for (const edge of edges) {
        const fromAnchor = resolveAnchor(edge.fromSpanId);
        const toAnchor = resolveAnchor(edge.toSpanId);

        if (fromAnchor && toAnchor && fromAnchor.id !== toAnchor.id) {
          const isSnapped = fromAnchor.id !== edge.fromSpanId || toAnchor.id !== edge.toSpanId;
          const connKey = `${fromAnchor.id}->${toAnchor.id}`;

          if (!seenConnections.has(connKey)) {
            seenConnections.add(connKey);

            let distance = edge.distance;
            
            // If the connection is snapped/tunneled, calculate and inject a visual Ghost Span
            if (isSnapped) {
              const origFrom = spans.find(x => x.id === edge.fromSpanId);
              const origTo = spans.find(x => x.id === edge.toSpanId);

              // Gather skipped/hidden intermediate spans along the original lineages
              const unionLineage = new Set<string>();
              if (origFrom) origFrom.parentage.forEach(id => unionLineage.add(id));
              if (origTo) origTo.parentage.forEach(id => unionLineage.add(id));

              // Exclude snapped visible endpoints from the hidden set
              unionLineage.delete(fromAnchor.id);
              unionLineage.delete(toAnchor.id);

              const hiddenSpans = spans.filter(s => unionLineage.has(s.id) && !visibleSpanIds.has(s.id));

              if (hiddenSpans.length > 0) {
                const hiddenCount = hiddenSpans.length;
                const truncatedLineage = hiddenSpans.map(h => `${h.name} (L${h.viewLevel})`);

                const startTimes = hiddenSpans.map(h => h.startTimeUs);
                const endTimes = hiddenSpans.map(h => h.startTimeUs + (h.durationUs || 0));

                const startTimeUs = Math.min(...startTimes);
                const endTimeUs = Math.max(...endTimes);
                const durationUs = endTimeUs > startTimeUs ? endTimeUs - startTimeUs : 0;

                const ghostId = `ghost-${fromAnchor.id}-${toAnchor.id}`;
                ghostSpans.push({
                  id: ghostId,
                  fromSpanId: fromAnchor.id,
                  toSpanId: toAnchor.id,
                  hiddenCount,
                  truncatedLineage,
                  durationUs,
                  startTimeUs,
                  endTimeUs,
                });

                distance = Math.max(1, edge.distance);
              }
            }

            snappedEdges.push({
              ...edge,
              fromSpanId: fromAnchor.id,
              toSpanId: toAnchor.id,
              distance,
            });
          }
        }
      }
      finalEdges = snappedEdges;
      console.log(`[LogServiceImpl] Edges computed: ${finalEdges.length} visible connections (Created ${ghostSpans.length} Ghost Span(s))`);
    }

    return {
      metadata: {
        traceId,
        levelNames,
      },
      spans: finalSpans,
      edges: finalEdges,
      ghostSpans,
    };
  }

  private triggerTraces(items: { traceId: string }[]): void {
    if (!this.worker) {
      console.warn(`[LogServiceImpl] TraceMaterializationWorker is not configured! Skipping compilation.`);
      return;
    }
    const uniqueIds = Array.from(new Set(items.map(item => item.traceId)));
    console.log(`[LogServiceImpl] Telemetry received. Triggering compilation/materialization for traceIds: [${uniqueIds.join(", ")}]`);
    for (const traceId of uniqueIds) {
      this.worker.triggerMaterialization(traceId);
    }
  }

  override async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    console.log(`[LogServiceImpl] Listing traces (page: ${page}, limit: ${limit})`);
    const [traces, total] = await Promise.all([
      this.logRepo.fetchTracesList(page, limit),
      this.logRepo.fetchTracesCount(),
    ]);
    console.log(`[LogServiceImpl] Found ${traces.length} traces in database. Total trace count: ${total}`);
    return {
      traces,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

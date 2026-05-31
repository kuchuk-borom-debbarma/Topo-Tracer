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
    }));

    await this.logRepo.saveSpans(enriched);
    this.triggerTraces(spans);
  }

  override async logEdges(edges: TraceEdgeInput[]): Promise<void> {
    const enriched: TraceEdge[] = edges.map(edge => ({
      ...edge,
      timestamp: new Date(edge.timestamp),
    }));

    await this.logRepo.saveEdges(enriched);
    this.triggerTraces(edges);
  }

  override async getTraceLayout(traceId: string, maxLevel?: number): Promise<TraceLayoutResponse | null> {
    // 1. Fetch pre-calculated visual layout JSON metadata
    const meta = await this.logRepo.fetchReadTraceMeta(traceId);
    let levelNames: Record<number, string> = {};
    let spans: ReadSpan[] = [];
    let edges: ReadEdge[] = [];

    if (meta) {
      levelNames = meta.levelNames || {};
      try {
        const layout = JSON.parse(meta.layoutJson);
        spans = layout.spans || [];
        edges = layout.edges || [];
      } catch (err) {
        console.error("[LogServiceImpl] Failed to parse layout JSON string, falling back to direct query:", err);
      }
    }

    // Fallback: If cache is somehow empty, query read tables directly to remain robust
    if (spans.length === 0) {
      const [dbSpans, dbEdges] = await Promise.all([
        this.logRepo.fetchReadSpans(traceId),
        this.logRepo.fetchReadEdges(traceId),
      ]);
      spans = dbSpans;
      edges = dbEdges;
    }

    if (spans.length === 0) {
      return null;
    }

    // 2. Perform Dynamic View-Level Filtering & Snappy Link Tunneling
    let finalSpans = spans;
    let finalEdges = edges;
    const ghostSpans: GhostSpan[] = [];

    if (maxLevel !== undefined) {
      // Keep only spans that fit in the selected view Level
      finalSpans = spans.filter(s => s.viewLevel <= maxLevel);
      const visibleSpanIds = new Set(finalSpans.map(s => s.id));

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
    if (!this.worker) return;
    const uniqueIds = Array.from(new Set(items.map(item => item.traceId)));
    for (const traceId of uniqueIds) {
      this.worker.triggerMaterialization(traceId);
    }
  }

  override async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    const [traces, total] = await Promise.all([
      this.logRepo.fetchTracesList(page, limit),
      this.logRepo.fetchTracesCount(),
    ]);
    return {
      traces,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

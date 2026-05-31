import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";
import type { ReadSpan, ReadEdge } from "../../types";

@Service()
export class TraceMaterializationWorker {
  private timers = new Map<string, NodeJS.Timeout>();
  private runningTraces = new Set<string>();

  constructor(private logRepo: LogRepo) {}

  public triggerMaterialization(traceId: string): void {
    if (!traceId) return;

    if (this.timers.has(traceId)) {
      clearTimeout(this.timers.get(traceId)!);
    }

    const timer = setTimeout(async () => {
      this.timers.delete(traceId);
      await this.runMaterializationSafely(traceId);
    }, 1000); // 1-second debounce

    this.timers.set(traceId, timer);
  }

  private async runMaterializationSafely(traceId: string): Promise<void> {
    if (this.runningTraces.has(traceId)) {
      this.triggerMaterialization(traceId);
      return;
    }

    this.runningTraces.add(traceId);
    try {
      console.log(`[TraceMaterializationWorker] Compiling V4 layout for trace: ${traceId}`);
      await this.materialize(traceId);
      console.log(`[TraceMaterializationWorker] V4 layout completed successfully for trace: ${traceId}`);
    } catch (error) {
      console.error(`[TraceMaterializationWorker] V4 compilation failed for trace ${traceId}:`, error);
    } finally {
      this.runningTraces.delete(traceId);
    }
  }

  public async materialize(traceId: string): Promise<void> {
    console.log(`[TraceMaterializationWorker] [${traceId}] Starting V4 trace materialization pipeline...`);
    
    // 1. Bulk fetch raw trace facts
    const [rawSpans, rawEdges] = await Promise.all([
      this.logRepo.fetchSpans(traceId),
      this.logRepo.fetchRawEdges(traceId),
    ]);

    console.log(`[TraceMaterializationWorker] [${traceId}] Fetched raw facts: ${rawSpans.length} spans, ${rawEdges.length} edges`);

    if (!rawSpans.length) {
      console.warn(`[TraceMaterializationWorker] [${traceId}] No spans found for trace. Skipping.`);
      return;
    }

    // 2. Map spans for O(1) lookups
    const spanMap = new Map<string, typeof rawSpans[0]>();
    for (const s of rawSpans) {
      spanMap.set(s.id, s);
    }

    // 3. Resolve visual level names mapped inside started events
    const levelNames: Record<number, string> = {};
    for (const s of rawSpans) {
      if (s.eventType === "started" && s.levelNames) {
        Object.assign(levelNames, s.levelNames);
      }
    }
    console.log(`[TraceMaterializationWorker] [${traceId}] Resolved visual level name mappings:`, levelNames);

    // 4. Group started/ended raw spans to resolve timings (startTimeUs, durationUs)
    type CollapsedSpan = {
      id: string;
      parentId: string | null;
      name: string;
      kind: "boundary" | "execution";
      type: string;
      tags: Record<string, string>;
      viewLevel: number;
      startTimeUs: number;
      endTimeUs?: number;
    };

    const collapsedSpansMap = new Map<string, CollapsedSpan>();
    for (const s of rawSpans) {
      const existing = collapsedSpansMap.get(s.id);
      const tUs = s.timestamp.getTime() * 1000;
      if (!existing) {
        collapsedSpansMap.set(s.id, {
          id: s.id,
          parentId: s.parentId,
          name: s.name,
          kind: s.kind,
          type: s.type,
          tags: s.tags || {},
          viewLevel: s.viewLevel !== undefined ? s.viewLevel : 0,
          startTimeUs: tUs,
          endTimeUs: s.eventType === "ended" ? tUs : undefined,
        });
      } else {
        if (s.eventType === "started") {
          existing.startTimeUs = Math.min(existing.startTimeUs, tUs);
          if (s.viewLevel !== undefined) {
            existing.viewLevel = s.viewLevel;
          }
        } else {
          existing.endTimeUs = existing.endTimeUs ? Math.max(existing.endTimeUs, tUs) : tUs;
        }
        existing.tags = { ...existing.tags, ...(s.tags || {}) };
      }
    }
    console.log(`[TraceMaterializationWorker] [${traceId}] Collapsed ${rawSpans.length} raw span events into ${collapsedSpansMap.size} logical spans`);

    // 5. Resolve recursive parentage path [root_id, parent_id, ..., current_id]
    const parentageMap = new Map<string, string[]>();
    const getSpanParentage = (spanId: string): string[] => {
      if (parentageMap.has(spanId)) {
        return parentageMap.get(spanId)!;
      }

      const cs = collapsedSpansMap.get(spanId);
      if (!cs || !cs.parentId) {
        const path = [spanId];
        parentageMap.set(spanId, path);
        return path;
      }

      const parentPath = getSpanParentage(cs.parentId);
      const path = [...parentPath, spanId];
      parentageMap.set(spanId, path);
      return path;
    };

    // Calculate parentages for all collapsed spans
    for (const sid of collapsedSpansMap.keys()) {
      getSpanParentage(sid);
    }

    // 6. Sort child spans chronologically by startTimeUs inside siblings to assign localSequence index
    const childrenGroups = new Map<string, CollapsedSpan[]>(); // parentId -> childSpans
    const rootSpans: CollapsedSpan[] = [];

    for (const cs of collapsedSpansMap.values()) {
      if (cs.parentId) {
        const list = childrenGroups.get(cs.parentId) || [];
        list.push(cs);
        childrenGroups.set(cs.parentId, list);
      } else {
        rootSpans.push(cs);
      }
    }

    const readSpansToInsert: ReadSpan[] = [];
    const containerIds = new Set<string>();
    const allTags = new Set<string>();

    const compileSpan = (cs: CollapsedSpan, localSeq: number): ReadSpan => {
      if (cs.kind === "boundary") {
        containerIds.add(cs.id);
      }
      Object.keys(cs.tags).forEach(k => allTags.add(`${k}:${cs.tags[k]}`));

      const durationUs = cs.endTimeUs && cs.endTimeUs > cs.startTimeUs ? cs.endTimeUs - cs.startTimeUs : 0;
      return {
        id: cs.id,
        traceId,
        parentId: cs.parentId,
        name: cs.name,
        kind: cs.kind,
        type: cs.type,
        tags: cs.tags,
        parentage: parentageMap.get(cs.id) || [cs.id],
        viewLevel: cs.viewLevel,
        localSequence: localSeq,
        startTimeUs: cs.startTimeUs,
        durationUs: durationUs || null,
        metadata: null,
      };
    };

    // Recursively traverse tree chronologically to assign localSequence Y-coordinates
    const compileTree = (nodes: CollapsedSpan[]) => {
      nodes.sort((a, b) => a.startTimeUs - b.startTimeUs);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const readSpan = compileSpan(node, i);
        readSpansToInsert.push(readSpan);

        const children = childrenGroups.get(node.id);
        if (children && children.length > 0) {
          compileTree(children);
        }
      }
    };

    compileTree(rootSpans);
    console.log(`[TraceMaterializationWorker] [${traceId}] Resolved parentages and local Y-sequence order for ${readSpansToInsert.length} read-optimized spans`);

    // 7. Compile read edges with chronological distance metrics
    const readEdgesToInsert: ReadEdge[] = [];
    
    // Sort all trace items chronologically
    type ChronoItem = { id: string; startTimeUs: number };
    const chronoItems: ChronoItem[] = readSpansToInsert.map(s => ({
      id: s.id,
      startTimeUs: s.startTimeUs,
    }));
    chronoItems.sort((a, b) => a.startTimeUs - b.startTimeUs);

    const getChronoIndex = (id: string): number => {
      return chronoItems.findIndex(item => item.id === id);
    };

    const uniqueEdgeIds = Array.from(new Set(rawEdges.map(e => e.id)));
    for (const eid of uniqueEdgeIds) {
      const edgeEvents = rawEdges.filter(e => e.id === eid);
      const primary = edgeEvents[0];
      if (!primary) continue;

      const fromIdx = getChronoIndex(primary.fromSpanId);
      const toIdx = getChronoIndex(primary.toSpanId);
      let distance = 0;
      if (fromIdx !== -1 && toIdx !== -1) {
        distance = Math.max(0, Math.abs(toIdx - fromIdx) - 1);
      }

      readEdgesToInsert.push({
        id: eid,
        traceId,
        fromSpanId: primary.fromSpanId,
        toSpanId: primary.toSpanId,
        type: primary.type,
        distance,
        metadata: null,
      });
    }
    console.log(`[TraceMaterializationWorker] [${traceId}] Compiled ${readEdgesToInsert.length} read edges with sequential chronological distance metrics`);

    // 8. Pre-compile full layout JSON cache
    const layoutCache = {
      levelNames,
      spans: readSpansToInsert,
      edges: readEdgesToInsert,
    };
    const layoutJsonString = JSON.stringify(layoutCache);

    const minCreatedAt = Math.min(...readSpansToInsert.map(s => s.startTimeUs)) / 1000 || Date.now();
    console.log(`[TraceMaterializationWorker] [${traceId}] Serialized layout cache JSON length: ${layoutJsonString.length} bytes`);

    // 9. Batch insert all pre-computed read path structures
    console.log(`[TraceMaterializationWorker] [${traceId}] Batch inserting materialized read path data structures into ClickHouse...`);
    const startSave = Date.now();
    await Promise.all([
      this.logRepo.saveReadSpans(readSpansToInsert),
      this.logRepo.saveReadEdges(readEdgesToInsert),
      this.logRepo.saveReadTrace({
        traceId,
        containerIds: Array.from(containerIds),
        tags: Array.from(allTags),
        levelNames,
        layoutJson: layoutJsonString,
        createdAt: minCreatedAt,
      }),
    ]);
    console.log(`[TraceMaterializationWorker] [${traceId}] Materialized structure insert complete (Time taken: ${Date.now() - startSave}ms)`);
  }
}

import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";
import type { ReadContainer, ReadNode, ReadEdge } from "../../types";

/**
 * Background compiler service responsible for converting raw append-only ingestion events
 * (containers, nodes, edges) into coordinates and sequences optimized for dynamic tag-based filter snapping.
 */
@Service()
export class TraceMaterializationWorker {
  // Debounce timers per trace ID to throttle worker execution
  private timers = new Map<string, NodeJS.Timeout>();
  // Active materialization tasks to prevent concurrent duplicate processing
  private runningTraces = new Set<string>();

  constructor(private logRepo: LogRepo) {}

  /**
   * Schedules or resets a debounced materialization task for a given trace.
   * Aggregates writes over a 1-second inactive window.
   */
  public triggerMaterialization(traceId: string): void {
    if (!traceId) return;

    // Reset existing debounce timer
    if (this.timers.has(traceId)) {
      clearTimeout(this.timers.get(traceId)!);
    }

    const timer = setTimeout(async () => {
      this.timers.delete(traceId);
      await this.runMaterializationSafely(traceId);
    }, 1000); // 1-second debounce window

    this.timers.set(traceId, timer);
  }

  /**
   * Coordinates safe materialization execution, avoiding race conditions.
   */
  private async runMaterializationSafely(traceId: string): Promise<void> {
    if (this.runningTraces.has(traceId)) {
      // Re-schedule task if a run is already active
      this.triggerMaterialization(traceId);
      return;
    }

    this.runningTraces.add(traceId);
    try {
      console.log(`[TraceMaterializationWorker] Compiling V3 layout for trace: ${traceId}`);
      await this.materialize(traceId);
      console.log(`[TraceMaterializationWorker] V3 layout completed successfully for trace: ${traceId}`);
    } catch (error) {
      console.error(`[TraceMaterializationWorker] Materialization failed for trace ${traceId}:`, error);
    } finally {
      this.runningTraces.delete(traceId);
    }
  }

  /**
   * Dynamic V3 Layout Compiler.
   */
  public async materialize(traceId: string): Promise<void> {
    // 1. Bulk-fetch raw trace facts
    const [containers, nodes, rawEdges] = await Promise.all([
      this.logRepo.fetchContainers(traceId),
      this.logRepo.fetchNodes(traceId),
      this.logRepo.fetchRawEdges(traceId),
    ]);

    if (!containers.length) {
      console.warn(`[TraceMaterializationWorker] No containers found for trace ${traceId}. Skipping.`);
      return;
    }

    // 2. Map containers and nodes for O(1) key lookups
    const containerMap = new Map<string, typeof containers[0]>();
    for (const c of containers) {
      containerMap.set(c.id, c);
    }

    const nodeMap = new Map<string, typeof nodes[0]>();
    for (const n of nodes) {
      nodeMap.set(n.id, n);
    }

    // 3. Resolve parent-child container hierarchy using raw edges to detect trigger nodes:
    // If there is an edge from node S (in container A) to node T (in container B),
    // then node S is the trigger node that called container B.
    const triggerNodeForContainer = new Map<string, string>(); // containerId -> triggerNodeId
    for (const edge of rawEdges) {
      const fromNode = nodeMap.get(edge.fromNodeId);
      if (!fromNode) continue;
      if (edge.toType === "container") {
        triggerNodeForContainer.set(edge.toId, fromNode.id);
      } else {
        const toNode = nodeMap.get(edge.toId);
        if (toNode && fromNode.containerId !== toNode.containerId) {
          triggerNodeForContainer.set(toNode.containerId, fromNode.id);
        }
      }
    }

    // 4. Resolve container timings (start_time_us, duration_us)
    const containerNodes = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const list = containerNodes.get(n.containerId) || [];
      list.push(n);
      containerNodes.set(n.containerId, list);
    }

    const containerTimings = new Map<string, { start: number; end: number }>();
    const getContainerTimings = (containerId: string): { start: number; end: number } => {
      if (containerTimings.has(containerId)) {
        return containerTimings.get(containerId)!;
      }

      let start = Infinity;
      let end = -Infinity;

      // started/ended events for the container itself
      const containerEvents = containers.filter(c => c.id === containerId);
      for (const ev of containerEvents) {
        const tUs = ev.timestamp.getTime() * 1000;
        if (ev.eventType === "started") {
          start = Math.min(start, tUs);
        } else if (ev.eventType === "ended") {
          end = Math.max(end, tUs);
        }
      }

      // Node events inside this container
      const nList = containerNodes.get(containerId) || [];
      for (const n of nList) {
        const nUs = n.timestamp.getTime() * 1000;
        start = Math.min(start, nUs);
        end = Math.max(end, nUs);
      }

      // Child containers
      const childContainers = containers.filter(c => c.parentContainerId === containerId && c.id !== containerId);
      for (const cc of childContainers) {
        const ccTimings = getContainerTimings(cc.id);
        start = Math.min(start, ccTimings.start);
        end = Math.max(end, ccTimings.end);
      }

      if (start === Infinity) start = Date.now() * 1000;
      if (end === -Infinity) end = start;

      const timing = { start, end };
      containerTimings.set(containerId, timing);
      return timing;
    };

    const uniqueContainerIds = Array.from(new Set(containers.map(c => c.id)));
    for (const cid of uniqueContainerIds) {
      getContainerTimings(cid);
    }

    // 5. Resolve recursive parentage paths for containers
    const containerParentage = new Map<string, string[]>();
    const getContainerParentage = (containerId: string): string[] => {
      if (containerParentage.has(containerId)) {
        return containerParentage.get(containerId)!;
      }

      const container = containers.find(c => c.id === containerId);
      if (!container) {
        const path = [containerId];
        containerParentage.set(containerId, path);
        return path;
      }

      let parentCid = container.parentContainerId;
      if (parentCid && !containers.some(c => c.id === parentCid)) {
        const parentNode = nodeMap.get(parentCid);
        parentCid = parentNode ? parentNode.containerId : null;
      }

      if (!parentCid) {
        const path = [containerId];
        containerParentage.set(containerId, path);
        return path;
      }

      const parentPath = getContainerParentage(parentCid);
      const triggerNode = triggerNodeForContainer.get(containerId);
      const path = [...parentPath];
      if (triggerNode) {
        path.push(triggerNode);
      }
      path.push(containerId);
      containerParentage.set(containerId, path);
      return path;
    };

    // Compile read containers
    const readContainersToInsert: ReadContainer[] = [];
    const containerTagsMap = new Map<string, string[]>();

    for (const cid of uniqueContainerIds) {
      const containerEvents = containers.filter(c => c.id === cid);
      const primary = containerEvents[0];
      if (!primary) continue;

      // Merge tags across all events of this container
      const tagsSet = new Set<string>();
      containerEvents.forEach(e => e.tags && e.tags.forEach(t => tagsSet.add(t)));
      const tags = Array.from(tagsSet);
      containerTagsMap.set(cid, tags);

      const timing = containerTimings.get(cid) || { start: 0, end: 0 };
      const durationUs = timing.end > timing.start ? timing.end - timing.start : 0;

      readContainersToInsert.push({
        id: cid,
        traceId,
        parentContainerId: primary.parentContainerId,
        name: primary.name,
        type: primary.type,
        tags,
        parentage: getContainerParentage(cid),
        startTimeUs: timing.start,
        durationUs: durationUs || null,
        metadata: null,
      });
    }

    // 6. Compile nodes and node durations
    const collapsedNodesMap = new Map<string, {
      id: string;
      containerId: string;
      name: string;
      type: string;
      tags: string[];
      startTimeUs: number;
      endTimeUs?: number;
      metadata?: any;
    }>();

    for (const n of nodes) {
      const existing = collapsedNodesMap.get(n.id);
      const tUs = n.timestamp.getTime() * 1000;
      if (!existing) {
        collapsedNodesMap.set(n.id, {
          id: n.id,
          containerId: n.containerId,
          name: n.name,
          type: n.type,
          tags: n.tags || [],
          startTimeUs: tUs,
          endTimeUs: n.eventType === "ended" ? tUs : undefined,
          metadata: n.metadata,
        });
      } else {
        if (n.eventType === "started") {
          existing.startTimeUs = Math.min(existing.startTimeUs, tUs);
        } else {
          existing.endTimeUs = existing.endTimeUs ? Math.max(existing.endTimeUs, tUs) : tUs;
        }
        if (n.metadata) {
          existing.metadata = { ...existing.metadata, ...n.metadata };
        }
        const tagsSet = new Set([...existing.tags, ...(n.tags || [])]);
        existing.tags = Array.from(tagsSet);
      }
    }

    // Group nodes by container to compute localSequence Y-coordinates
    const nodesByContainer = new Map<string, ReadNode[]>();
    const readNodesToInsert: ReadNode[] = [];

    for (const cn of collapsedNodesMap.values()) {
      const parentage = [...getContainerParentage(cn.containerId), cn.id];
      const durationUs = cn.endTimeUs && cn.endTimeUs > cn.startTimeUs ? cn.endTimeUs - cn.startTimeUs : 0;

      const readNode: ReadNode = {
        id: cn.id,
        traceId,
        containerId: cn.containerId,
        name: cn.name,
        type: cn.type,
        tags: cn.tags,
        parentage,
        localSequence: 0, // Assigned below
        startTimeUs: cn.startTimeUs,
        durationUs: durationUs || null,
        metadata: cn.metadata,
      };

      const list = nodesByContainer.get(cn.containerId) || [];
      list.push(readNode);
      nodesByContainer.set(cn.containerId, list);
    }

    // Assign localSequence chronologically within each container
    for (const [cid, cNodes] of nodesByContainer.entries()) {
      cNodes.sort((a, b) => a.startTimeUs - b.startTimeUs);
      for (let i = 0; i < cNodes.length; i++) {
        const node = cNodes[i];
        if (node) {
          node.localSequence = i;
          readNodesToInsert.push(node);
        }
      }
    }

    // 7. Compile read edges
    const readEdgesToInsert: ReadEdge[] = [];
    const uniqueEdgeIds = Array.from(new Set(rawEdges.map(e => e.id)));

    // Create a chronological list of all elements in the trace to calculate distance
    type ChronoItem = { id: string; startTimeUs: number };
    const chronoItems: ChronoItem[] = [
      ...readContainersToInsert.map(c => ({ id: c.id, startTimeUs: c.startTimeUs })),
      ...readNodesToInsert.map(n => ({ id: n.id, startTimeUs: n.startTimeUs }))
    ];
    chronoItems.sort((a, b) => a.startTimeUs - b.startTimeUs);

    const getChronoIndex = (id: string): number => {
      return chronoItems.findIndex(item => item.id === id);
    };

    for (const eid of uniqueEdgeIds) {
      const edgeEvents = rawEdges.filter(e => e.id === eid);
      const primary = edgeEvents[0];
      if (!primary) continue;

      const fromIdx = getChronoIndex(primary.fromNodeId);
      const toIdx = getChronoIndex(primary.toId);
      let distance = 0;
      if (fromIdx !== -1 && toIdx !== -1) {
        distance = Math.max(0, Math.abs(toIdx - fromIdx) - 1);
      }

      readEdgesToInsert.push({
        id: eid,
        traceId,
        fromNodeId: primary.fromNodeId,
        toId: primary.toId,
        toType: primary.toType,
        type: primary.type,
        distance,
        metadata: null,
      });
    }

    // 8. Cache trace level aggregations
    const allTags = new Set<string>();
    readContainersToInsert.forEach(c => c.tags && c.tags.forEach(t => allTags.add(t)));
    readNodesToInsert.forEach(n => n.tags && n.tags.forEach(t => allTags.add(t)));

    const minCreatedAt = Math.min(...readContainersToInsert.map(c => c.startTimeUs)) / 1000 || Date.now();

    // 9. Batch insert read path structures
    await Promise.all([
      this.logRepo.saveReadContainers(readContainersToInsert),
      this.logRepo.saveReadNodes(readNodesToInsert),
      this.logRepo.saveReadEdges(readEdgesToInsert),
      this.logRepo.saveReadTrace({
        traceId,
        containerIds: uniqueContainerIds,
        tags: Array.from(allTags),
        createdAt: minCreatedAt,
      }),
      this.logRepo.saveTraceMetadata({
        traceId,
        isZoomReady: true,
        maxAvailableDepth: 0,
        materializedOffset: 0,
      }),
    ]);
  }
}

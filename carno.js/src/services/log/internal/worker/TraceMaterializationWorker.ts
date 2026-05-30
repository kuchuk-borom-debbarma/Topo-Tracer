import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";

/**
 * Background compiler service responsible for converting raw append-only ingestion events
 * (containers, blocks, nodes, edges) into coordinates and sequences optimized for dynamic zooming.
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
   * Aggregates writes over a 10-second inactive window.
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
    }, 10000); // 10-second debounce window

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
      console.log(`[TraceMaterializationWorker] Compiling zoom layout for trace: ${traceId}`);
      await this.materialize(traceId);
      console.log(`[TraceMaterializationWorker] Zoom layout completed successfully for trace: ${traceId}`);
    } catch (error) {
      console.error(`[TraceMaterializationWorker] Materialization failed for trace ${traceId}:`, error);
    } finally {
      this.runningTraces.delete(traceId);
    }
  }

  /**
   * Dynamic Layout Compiler (Chronological Y-sequence & Nested X-depth resolver).
   */
  private async materialize(traceId: string): Promise<void> {
    // 1. Bulk-fetch raw trace facts
    const [containers, blocks, collapsedNodes, rawEdges] = await Promise.all([
      this.logRepo.fetchContainers(traceId),
      this.logRepo.fetchBlocks(traceId),
      this.logRepo.fetchCollapsedNodes(traceId),
      this.logRepo.fetchRawEdges(traceId),
    ]);

    if (!containers.length) {
      console.warn(`[TraceMaterializationWorker] No containers found for trace ${traceId}. Skipping.`);
      return;
    }

    // 2. Map blocks and nodes for O(1) key lookups
    const blockMap = new Map<string, typeof blocks[0]>();
    for (const b of blocks) {
      blockMap.set(b.id, b);
    }

    const nodeToBlockMap = new Map<string, typeof collapsedNodes[0]>();
    for (const n of collapsedNodes) {
      nodeToBlockMap.set(n.id, n);
    }

    // 3. Resolve parent-child block hierarchy using raw calling edge transitions
    const blockParentMap = new Map<string, string>();        // child block -> parent block
    const blockTriggerNodeMap = new Map<string, string>();    // child block -> parent triggering node

    for (const edge of rawEdges) {
      const fromNode = nodeToBlockMap.get(edge.fromNodeId);
      const toNode = nodeToBlockMap.get(edge.toNodeId);

      if (fromNode && toNode && fromNode.blockId !== toNode.blockId) {
        // Node in fromNode.blockId triggered a call to toNode.blockId
        blockParentMap.set(toNode.blockId, fromNode.blockId);
        blockTriggerNodeMap.set(toNode.blockId, fromNode.id);
      }
    }

    // 4. Resolve absolute block horizontal offset nesting depth (X-Coordinate)
    const blockDepths = new Map<string, number>();
    const getBlockDepth = (blockId: string): number => {
      if (blockDepths.has(blockId)) return blockDepths.get(blockId)!;

      const parentId = blockParentMap.get(blockId);
      if (!parentId || !blockMap.has(parentId)) {
        blockDepths.set(blockId, 0); // Root function scope is at depth 0
        return 0;
      }

      const depth = getBlockDepth(parentId) + 1;
      blockDepths.set(blockId, depth);
      return depth;
    };

    for (const b of blocks) {
      getBlockDepth(b.id);
    }

    // 5. Derive block-level start/end times based on child nodes
    const blockTimings = new Map<string, { start: number; end: number }>();
    for (const n of collapsedNodes) {
      const current = blockTimings.get(n.blockId) || { start: Infinity, end: -Infinity };
      blockTimings.set(n.blockId, {
        start: Math.min(current.start, n.startTimeUs),
        end: Math.max(current.end, n.endTimeUs || n.startTimeUs),
      });
    }

    // 6. Group nodes by block to assign vertical flow indices (Y-Coordinate sequence)
    const nodesByBlock = new Map<string, typeof collapsedNodes>();
    for (const n of collapsedNodes) {
      const arr = nodesByBlock.get(n.blockId) || [];
      arr.push(n);
      nodesByBlock.set(n.blockId, arr);
    }

    const readNodesToInsert: any[] = [];
    for (const [blockId, blockNodes] of nodesByBlock.entries()) {
      // Sort chronologically
      blockNodes.sort((a, b) => a.startTimeUs - b.startTimeUs);

      for (let i = 0; i < blockNodes.length; i++) {
        const node = blockNodes[i];

        // Assign semantic visual importance zoom thresholds
        let zoomLevel = 1; // General service operations
        if (node.type === "http_server" || node.type === "rpc_server" || node.type === "express_api") {
          zoomLevel = 0; // Critical root milestones
        } else if (node.type === "db" || node.type === "step" || node.type === "log") {
          zoomLevel = 2; // Detailed debug logs
        }

        const parentBlock = blockMap.get(blockId);
        const containerId = parentBlock?.containerId || "";
        
        // Node ancestry path: [containerId, blockId, nodeId]
        const ancestryPath = [containerId, blockId, node.id];

        readNodesToInsert.push({
          id: node.id,
          trace_id: traceId,
          block_id: blockId,
          name: node.name,
          type: node.type,
          zoom_level: zoomLevel,
          local_sequence: i,
          start_time_us: node.startTimeUs,
          duration_us: node.durationUs,
          ancestry_path: ancestryPath,
          metadata: typeof node.metadata === "string" ? node.metadata : JSON.stringify(node.metadata || {}),
        });
      }
    }

    // 7. Map blocks with ancestry paths and depths
    const readBlocksToInsert = blocks.map(b => {
      const depth = blockDepths.get(b.id) || 0;
      const timing = blockTimings.get(b.id) || { start: 0, end: 0 };

      // Reconstruct ancestry path: [containerId, parent_blocks..., child_block_id]
      const path: string[] = [b.containerId];
      let currentId = b.id;
      const ancestors: string[] = [];
      while (blockParentMap.has(currentId)) {
        const parentId = blockParentMap.get(currentId)!;
        ancestors.unshift(parentId);
        currentId = parentId;
      }
      path.push(...ancestors, b.id);

      return {
        id: b.id,
        trace_id: traceId,
        container_id: b.containerId,
        parent_block_id: blockParentMap.get(b.id) || "",
        calling_node_id: blockTriggerNodeMap.get(b.id) || "",
        name: b.name,
        type: b.type,
        absolute_depth: depth,
        start_time_us: timing.start,
        duration_us: timing.start > 0 ? timing.end - timing.start : 0,
        ancestry_path: path,
        metadata: typeof b.metadata === "string" ? b.metadata : JSON.stringify(b.metadata || {}),
      };
    });

    // 8. Map connection wires
    const readEdgesToInsert = rawEdges.map(e => {
      const fromNode = nodeToBlockMap.get(e.fromNodeId);
      const toNode = nodeToBlockMap.get(e.toNodeId);
      return {
        id: `${e.id}_wire`,
        edge_id: e.id,
        trace_id: traceId,
        from_block_id: fromNode?.blockId || "",
        from_node_id: e.fromNodeId,
        to_block_id: toNode?.blockId || "",
        to_node_id: e.toNodeId,
      };
    });

    // 9. Batch-write layout coordinates to ClickHouse
    await Promise.all([
      this.logRepo.saveReadBlocks(readBlocksToInsert),
      this.logRepo.saveReadNodes(readNodesToInsert),
      this.logRepo.saveReadEdges(readEdgesToInsert),
    ]);

    // 10. Persist dynamic slider range metadata
    const maxDepth = Math.max(...Array.from(blockDepths.values()), 0);
    await this.logRepo.saveTraceMetadata({
      traceId,
      isZoomReady: true,
      maxAvailableDepth: maxDepth,
      materializedOffset: 0,
    });
  }
}

import type { MessageBroker } from "../../../../../infra/message/MessageBroker";
import type { LogRepo } from "../../LogRepo";

export class TraceClosureBuilder {
  constructor(
    private logRepo: LogRepo,
    private messageBroker: MessageBroker
  ) {}

  /**
   * Generates pre-computed visual wires (snaps) for varying UI zoom levels.
   */
  async resolve(
    traceId: string,
    offset: number,
    maxDepth: number,
    iteration: number
  ): Promise<void> {
    console.log(`[TraceClosureBuilder] Processing closures for trace ${traceId} at offset ${offset}`);

    const BATCH_SIZE = 1000;

    // 1. Fetch raw edges in chunks using repo
    const rawEdges = await this.logRepo.fetchEdgesForMaterialization(traceId, BATCH_SIZE, offset);

    if (rawEdges.length === 0) {
      console.log(`[TraceClosureBuilder] Completed trace: ${traceId} (Max Depth: ${maxDepth})`);
      
      // Update trace metadata
      await this.logRepo.updateTraceMaterializationMetadata(traceId, { is_zoom_ready: true });
      return;
    }

    // 2. Batch lookup egress ancestry
    const edgeIds = rawEdges.map(e => e.id);
    const egressAncestryRecords = await this.logRepo.fetchEdgeEgressAncestry(traceId, edgeIds);
    
    const egressMap = new Map<string, string[]>();
    for (const row of egressAncestryRecords) {
      egressMap.set(row.edge_id, row.egressAncestryPath);
    }

    // 2b. Batch lookup ingress ancestry
    const ingressNodeIds = Array.from(new Set(rawEdges.map(e => e.toNodeId)));
    const ingressAncestryRecords = await this.logRepo.fetchNodeAncestry(traceId, ingressNodeIds);

    const ingressMap = new Map<string, string[]>();
    for (const row of ingressAncestryRecords) {
      ingressMap.set(row.node_id, row.ancestryPath);
    }

    // 3. Generate Sparse Visual Wires
    const visualWiresToInsert: any[] = [];
    const cappedMaxDepth = Math.min(maxDepth, 100);

    for (const row of rawEdges) {
      const egressAncestryPath = egressMap.get(row.id) || [];
      const ingressAncestryPath = ingressMap.get(row.toNodeId) || [];
      
      let lastFromTargetId = "";
      let lastToTargetId = "";

      for (let d = 0; d <= cappedMaxDepth; d++) {
        let fromTargetId = row.fromContainerId;
        let fromTargetType = "container";
        let toTargetId = row.toContainerId;
        let toTargetType = "container";

        if (d > 0) {
          // If a parent node exists at this depth, snap to it. Otherwise, point to the exact target node.
          if ((d - 1) < egressAncestryPath.length) {
            fromTargetId = egressAncestryPath[d - 1]!;
            fromTargetType = "node";
          } else {
            fromTargetId = row.fromNodeId;
            fromTargetType = "node";
          }

          // Same logic for ingress: collapse to the highest visible parent or target the exact node
          if ((d - 1) < ingressAncestryPath.length) {
            toTargetId = ingressAncestryPath[d - 1]!;
            toTargetType = "node";
          } else {
            toTargetId = row.toNodeId;
            toTargetType = "node";
          }
        }

        if (fromTargetId !== lastFromTargetId || toTargetId !== lastToTargetId) {
          visualWiresToInsert.push({
            id: `${row.id}_${d}`,
            edge_id: row.id,
            trace_id: traceId,
            visual_depth: d,
            from_target_id: fromTargetId,
            from_target_type: fromTargetType,
            to_target_id: toTargetId,
            to_target_type: toTargetType,
          });
          lastFromTargetId = fromTargetId;
          lastToTargetId = toTargetId;
        }
      }
    }

    // 4. Bulk insert sparse wires
    await this.logRepo.saveVisualWiresBatch(traceId, visualWiresToInsert);

    // 5. Publish next event
    await this.messageBroker.publish({
      topic: "trace_materialization",
      key: traceId,
      payload: {
        traceId,
        stage: "BUILD_CLOSURES",
        offset: offset + BATCH_SIZE,
        maxDepth,
        iteration: 1,
      },
    });
  }
}

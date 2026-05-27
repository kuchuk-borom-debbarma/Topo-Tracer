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
    
    const egressMap = new Map<string, { path: string[], depths: number[] }>();
    for (const row of egressAncestryRecords) {
      egressMap.set(row.edge_id, { path: row.egressAncestryPath, depths: row.egressAncestryDepths });
    }

    // 2b. Batch lookup ingress ancestry
    const ingressNodeIds = Array.from(new Set(rawEdges.map(e => e.toNodeId)));
    const ingressAncestryRecords = await this.logRepo.fetchNodeAncestry(traceId, ingressNodeIds);

    const ingressMap = new Map<string, { path: string[], depths: number[] }>();
    for (const row of ingressAncestryRecords) {
      ingressMap.set(row.node_id, { path: row.ancestryPath, depths: row.ancestryDepths });
    }

    // 3. Generate Sparse Visual Wires
    const visualWiresToInsert: any[] = [];
    const cappedMaxDepth = Math.min(maxDepth, 100);

    for (const row of rawEdges) {
      const egressInfo = egressMap.get(row.id) || { path: [], depths: [] };
      const ingressInfo = ingressMap.get(row.toNodeId) || { path: [], depths: [] };
      
      let lastFromTargetId = "";
      let lastToTargetId = "";

      for (let d = 0; d <= cappedMaxDepth; d++) {
        let fromTargetId = row.fromContainerId;
        let fromTargetType = "container";
        let toTargetId = row.toContainerId;
        let toTargetType = "container";

        if (d > 0) {
          // Find the deepest node in the ancestry path whose depthIndex <= d
          let egressNodeAtDepth: string | null = null;
          for (let i = egressInfo.depths.length - 1; i >= 0; i--) {
            if (egressInfo.depths[i]! <= d) {
              egressNodeAtDepth = egressInfo.path[i]!;
              break;
            }
          }

          if (egressNodeAtDepth) {
            fromTargetId = egressNodeAtDepth;
            fromTargetType = "node";
          } else {
            // No node in this container exists at or above depth `d`
            // So we snap to the container boundary.
            fromTargetId = row.fromContainerId;
            fromTargetType = "container";
          }

          // Same logic for ingress
          let ingressNodeAtDepth: string | null = null;
          for (let i = ingressInfo.depths.length - 1; i >= 0; i--) {
            if (ingressInfo.depths[i]! <= d) {
              ingressNodeAtDepth = ingressInfo.path[i]!;
              break;
            }
          }

          if (ingressNodeAtDepth) {
            toTargetId = ingressNodeAtDepth;
            toTargetType = "node";
          } else {
            toTargetId = row.toContainerId;
            toTargetType = "container";
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

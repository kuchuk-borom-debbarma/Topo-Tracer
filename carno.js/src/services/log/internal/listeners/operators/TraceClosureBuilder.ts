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
    maxLocalDepth: number,
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
    
    const egressMap = new Map<string, { path: string[], depths: number[], localDepths: number[] }>();
    for (const row of egressAncestryRecords) {
      egressMap.set(row.edge_id, { path: row.egressAncestryPath, depths: row.egressAncestryDepths, localDepths: row.egressAncestryLocalDepths });
    }

    // 2b. Batch lookup ingress ancestry
    const ingressNodeIds = Array.from(new Set(rawEdges.map(e => e.toNodeId)));
    const ingressAncestryRecords = await this.logRepo.fetchNodeAncestry(traceId, ingressNodeIds);

    const ingressMap = new Map<string, { path: string[], depths: number[], localDepths: number[] }>();
    for (const row of ingressAncestryRecords) {
      ingressMap.set(row.node_id, { path: row.ancestryPath, depths: row.ancestryDepths, localDepths: row.ancestryLocalDepths });
    }

    // 3. Generate Sparse Visual Wires
    const visualWiresToInsert: any[] = [];
    
    for (const row of rawEdges) {
      const egressInfo = egressMap.get(row.id) || { path: [], depths: [], localDepths: [] };
      const ingressInfo = ingressMap.get(row.toNodeId) || { path: [], depths: [], localDepths: [] };
      
      const buildWires = (depthType: 'global' | 'local', depthsArrayEgress: number[], depthsArrayIngress: number[], maxIterDepth: number) => {
        let lastFromTargetId = "";
        let lastToTargetId = "";
        // Cap iterations at 100 to prevent runaway loops on extremely deep traces
        const cappedDepth = Math.min(maxIterDepth, 100);

        for (let d = 0; d <= cappedDepth; d++) {
          let fromTargetId = row.fromContainerId;
          let fromTargetType = "container";
          let toTargetId = row.toContainerId;
          let toTargetType = "container";

          if (d > 0 || depthType === 'local') {
            // For global depth, d=0 strictly collapses everything into container boxes (macro infra view).
            // For local depth, d=0 drills directly into the root node of every container (API blueprint view).
            let egressNodeAtDepth: string | null = null;
            
            // Search backward through the parallel depths array to find the deepest ancestor 
            // whose absolute nesting depth is less than or equal to the current visual depth layer.
            for (let i = depthsArrayEgress.length - 1; i >= 0; i--) {
              if (depthsArrayEgress[i]! <= d) {
                egressNodeAtDepth = egressInfo.path[i]!;
                break;
              }
            }

            // If we found a valid ancestor node at this visual depth, the UI wire snaps to it.
            // Otherwise, it falls back to snapping to the outer container bounding box.
            if (egressNodeAtDepth) {
              fromTargetId = egressNodeAtDepth;
              fromTargetType = "node";
            }

            let ingressNodeAtDepth: string | null = null;
            for (let i = depthsArrayIngress.length - 1; i >= 0; i--) {
              if (depthsArrayIngress[i]! <= d) {
                ingressNodeAtDepth = ingressInfo.path[i]!;
                break;
              }
            }

            if (ingressNodeAtDepth) {
              toTargetId = ingressNodeAtDepth;
              toTargetType = "node";
            }
          }

          // Optimization: Sparse Array Caching
          // Instead of writing a row for every single visual depth integer (which scales linearly), 
          // we only insert a row into the database when the snap targets *change*.
          // The UI will query with `< d ORDER BY visual_depth DESC LIMIT 1` to find the closest applicable wire.
          if (fromTargetId !== lastFromTargetId || toTargetId !== lastToTargetId || d === 0) {
            visualWiresToInsert.push({
              id: `${row.id}_${depthType}_${d}`,
              edge_id: row.id,
              trace_id: traceId,
              depth_type: depthType,
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
      };

      buildWires('global', egressInfo.depths, ingressInfo.depths, maxDepth);
      buildWires('local', egressInfo.localDepths, ingressInfo.localDepths, maxLocalDepth);
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
        maxLocalDepth,
        iteration: 1,
      },
    });
  }
}

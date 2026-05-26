import type { MessageBroker } from "../../../../infra/message/MessageBroker";
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

    // 3. Generate Sparse Visual Wires
    const visualWiresToInsert: any[] = [];
    const cappedMaxDepth = Math.min(maxDepth, 100);

    for (const row of rawEdges) {
      const egressAncestryPath = egressMap.get(row.id) || [];
      
      let lastFromTargetId = "";

      for (let d = 0; d <= cappedMaxDepth; d++) {
        let fromTargetId = row.fromContainerId;
        let fromTargetType = "container";

        if (d > 0) {
          if ((d - 1) < egressAncestryPath.length) {
            fromTargetId = egressAncestryPath[d - 1];
            fromTargetType = "node";
          } else {
            fromTargetId = row.fromNodeId;
            fromTargetType = "node";
          }
        }

        if (fromTargetId !== lastFromTargetId) {
          visualWiresToInsert.push({
            id: `${row.id}_${d}`,
            edge_id: row.id,
            trace_id: traceId,
            visual_depth: d,
            from_target_id: fromTargetId,
            from_target_type: fromTargetType,
            to_node_id: row.toNodeId,
          });
          lastFromTargetId = fromTargetId;
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

import type { MessageBroker } from "../../../../../infra/message/MessageBroker";
import type { LogRepo } from "../../LogRepo";
import type { EdgeEgressAncestryRecord } from "../../../types";

export class TraceEdgeResolver {
  constructor(
    private logRepo: LogRepo,
    private messageBroker: MessageBroker
  ) {}

  /**
   * Resolves egress ancestry paths for edges.
   * Emits BUILD_CLOSURES event if this was the last batch of edges.
   */
  async resolve(
    traceId: string,
    offset: number,
    maxDepth: number,
    iteration: number
  ): Promise<void> {
    console.log(`[TraceEdgeResolver] Processing edges for trace ${traceId} at offset ${offset}`);

    const BATCH_SIZE = 1000;

    // 1. Fetch edges in chunks using repo
    const rawEdges = await this.logRepo.fetchEdgesForMaterialization(traceId, BATCH_SIZE, offset);

    if (rawEdges.length === 0) {
      console.log(`[TraceEdgeResolver] Edges completed. Transitioning to Closure Builder for trace: ${traceId}`);
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "BUILD_CLOSURES",
          offset: 0,
          maxDepth,
          iteration: 1,
        },
      });
      return;
    }

    // 2. Fetch node ancestry for egress nodes
    const egressNodeIds = Array.from(new Set(rawEdges.map(e => e.fromNodeId)));
    const ancestryRecords = await this.logRepo.fetchNodeAncestry(traceId, egressNodeIds);

    const ancestryMap = new Map<string, { path: string[], depths: number[] }>();
    for (const row of ancestryRecords) {
      ancestryMap.set(row.node_id, { path: row.ancestryPath, depths: row.ancestryDepths });
    }

    // 3. Prepare records
    const egressRecordsToInsert: EdgeEgressAncestryRecord[] = [];
    for (const row of rawEdges) {
      const info = ancestryMap.get(row.fromNodeId) || { path: [row.fromNodeId], depths: [0] };
      egressRecordsToInsert.push({
        edge_id: row.id,
        egressAncestryPath: info.path,
        egressAncestryDepths: info.depths,
      });
    }

    // 4. Bulk insert
    await this.logRepo.saveEdgeEgressAncestryBatch(traceId, egressRecordsToInsert);

    // 5. Publish next event
    await this.messageBroker.publish({
      topic: "trace_materialization",
      key: traceId,
      payload: {
        traceId,
        stage: "RESOLVE_EDGES",
        offset: offset + BATCH_SIZE,
        maxDepth,
        iteration: 1,
      },
    });
  }
}

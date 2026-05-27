import type { MessageBroker } from "../../../../../infra/message/MessageBroker";
import type { LogRepo } from "../../LogRepo";
import type { NodeAncestryRecord } from "../../../types";

export class TraceNodeResolver {
  constructor(
    private logRepo: LogRepo,
    private messageBroker: MessageBroker
  ) {}

  /**
   * Resolves the full ancestry paths for a batch of nodes.
   * Emits a RESOLVE_EDGES event if this was the last batch of nodes.
   *
   * @param traceId The unique trace ID.
   * @param offset The chronological batch offset.
   * @param currentMaxDepth The deepest stack level observed so far.
   * @param iteration Guard against infinite recursion.
   */
  async resolve(
    traceId: string,
    offset: number,
    currentMaxDepth: number,
    currentMaxLocalDepth: number,
    iteration: number
  ): Promise<void> {
    console.log(`[TraceNodeResolver] Processing nodes for trace ${traceId} at offset ${offset}`);

    const BATCH_SIZE = 1000;
    const MAX_DEPTH_LIMIT = 100;
    let maxDepth = currentMaxDepth;
    let maxLocalDepth = currentMaxLocalDepth || 0;

    // 1. Fetch nodes chronologically using repo
    const rawNodes = await this.logRepo.fetchNodesForMaterialization(traceId, BATCH_SIZE, offset);

    if (rawNodes.length === 0) {
      // Transition to Stage 2 if no nodes remain
      console.log(`[TraceNodeResolver] Nodes completed. Transitioning to Edge Resolver for trace: ${traceId}`);
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "RESOLVE_EDGES",
          offset: 0,
          maxDepth,
          maxLocalDepth,
          iteration: 1,
        },
      });
      return;
    }

    // 2. Identify external parents
    const localNodeMap = new Map<string, any>(rawNodes.map(n => [n.id, n]));
    let currentMissingParents = new Set<string>();

    for (const row of rawNodes) {
      if (row.parentNodeId && !localNodeMap.has(row.parentNodeId)) {
        currentMissingParents.add(row.parentNodeId);
      }
    }

    const dbAncestryMap = new Map<string, { path: string[], depths: number[], localDepths: number[] }>();
    let resolutionDepth = 0;

    // 3. Iterative Batch Parent Fetch
    while (currentMissingParents.size > 0 && resolutionDepth < MAX_DEPTH_LIMIT) {
      resolutionDepth++;
      const missingIds = Array.from(currentMissingParents);
      
      const cachedAncestry = await this.logRepo.fetchNodeAncestry(traceId, missingIds);

      for (const row of cachedAncestry) {
        dbAncestryMap.set(row.node_id, { path: row.ancestryPath, depths: row.ancestryDepths, localDepths: row.ancestryLocalDepths });
        currentMissingParents.delete(row.node_id);
      }

      if (currentMissingParents.size === 0) break;

      const remainingIds = Array.from(currentMissingParents);
      const fallbackNodes = await this.logRepo.fetchNodesByIds(traceId, remainingIds);

      for (const row of fallbackNodes) {
        localNodeMap.set(row.id, row);
        currentMissingParents.delete(row.id);

        if (row.parentNodeId && !localNodeMap.has(row.parentNodeId) && !dbAncestryMap.has(row.parentNodeId)) {
          currentMissingParents.add(row.parentNodeId);
        }
      }
    }

    // 4. Resolve paths entirely in-memory
    const resolvedPaths = new Map<string, { path: string[], depths: number[], localDepths: number[] }>();

    const resolvePath = (nodeId: string, currentDepth: number = 0): { path: string[], depths: number[], localDepths: number[] } => {
      if (currentDepth > MAX_DEPTH_LIMIT) return { path: [nodeId], depths: [0], localDepths: [0] };
      if (!nodeId) return { path: [], depths: [], localDepths: [] };
      if (resolvedPaths.has(nodeId)) return resolvedPaths.get(nodeId)!;
      if (dbAncestryMap.has(nodeId)) return dbAncestryMap.get(nodeId)!;

      const node = localNodeMap.get(nodeId);
      if (!node) return { path: [nodeId], depths: [0], localDepths: [0] };

      const parentInfo = resolvePath(node.parentNodeId, currentDepth + 1);
      const fullPath = [...parentInfo.path, nodeId];
      const fullDepths = [...parentInfo.depths, Number(node.depthIndex)];
      const fullLocalDepths = [...parentInfo.localDepths, Number(node.localDepthIndex || 0)];
      
      const result = { path: fullPath, depths: fullDepths, localDepths: fullLocalDepths };
      resolvedPaths.set(nodeId, result);
      return result;
    };

    const newAncestryRecords: NodeAncestryRecord[] = [];
    for (const row of rawNodes) {
      const info = resolvePath(row.id);
      
      if (info.path.length > maxDepth) {
        maxDepth = info.path.length;
      }
      
      if (row.localDepthIndex !== undefined && row.localDepthIndex > maxLocalDepth) {
        maxLocalDepth = row.localDepthIndex;
      }
      
      newAncestryRecords.push({
        node_id: row.id,
        ancestryPath: info.path,
        ancestryDepths: info.depths,
        ancestryLocalDepths: info.localDepths,
      });
    }

    // 5. Bulk insert resolved paths
    await this.logRepo.saveNodeAncestryBatch(traceId, newAncestryRecords);

    // 6. Update max_available_depth metadata
    if (maxDepth > currentMaxDepth || maxLocalDepth > currentMaxLocalDepth) {
      await this.logRepo.updateTraceMaterializationMetadata(traceId, { max_available_depth: maxDepth, max_available_local_depth: maxLocalDepth });
    }

    // 7. Publish next batch offset
    await this.messageBroker.publish({
      topic: "trace_materialization",
      key: traceId,
      payload: {
        traceId,
        stage: "RESOLVE_NODES",
        offset: offset + BATCH_SIZE,
        maxDepth,
        maxLocalDepth,
        iteration: 1,
      },
    });
  }
}

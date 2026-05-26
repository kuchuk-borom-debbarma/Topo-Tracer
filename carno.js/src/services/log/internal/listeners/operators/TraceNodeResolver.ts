import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../../infra/ClickHouseService";
import { MessageBroker } from "../../../../../infra/message/MessageBroker";

/**
 * TraceNodeResolver (Stage 1 of Trace Materialization)
 * Resolves the parent-to-child call stack (ancestry path) for nodes in a trace.
 *
 * DESIGN PRINCIPLES:
 * 1. 100% Memory Safe: Processes nodes in chunked batches of 1000.
 * 2. DB-Backed Ancestry: Queries parent paths from the `node_ancestry` database table.
 *    Since nodes are processed chronologically, parents are always computed and cached in DB
 *    before their children are reached. This avoids keeping massive maps in RAM.
 * 3. Event-Driven Non-Blocking Chunking: If there are more than 1000 nodes, it resolves the
 *    first 1000, writes them, and publishes a new message to the broker with an incremented
 *    offset. This yields back to the main event loop, preventing execution starvation.
 * 4. ReplacingMergeTree: Writes use timestamp-based versions, making operations fully
 *    idempotent and crash-resilient without duplicating records.
 */
@Service()
export class TraceNodeResolver {
  constructor(
    private clickHouse: ClickHouseService,
    private messageBroker: MessageBroker
  ) {}

  async resolve(
    traceId: string,
    offset: number,
    _ancestryCacheData: Record<string, string[]>,
    currentMaxDepth: number,
    iteration: number
  ): Promise<void> {
    console.log(`[TraceNodeResolver] Processing nodes for trace ${traceId} at offset ${offset}`);

    const BATCH_SIZE = 1000;
    const MAX_DEPTH_LIMIT = 100;
    let maxDepth = currentMaxDepth;

    // 1. Fetch nodes chronologically
    const nodesResultSet = await this.clickHouse.client.query({
      query: `
        SELECT * FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
        ORDER BY initiatedAtLocal ASC, id ASC
        LIMIT {limit: UInt32} OFFSET {offset: UInt32}
      `,
      query_params: {
        traceId,
        limit: BATCH_SIZE,
        offset,
      },
      format: "JSONEachRow",
    });

    const nodesResponse = (await nodesResultSet.json()) as unknown as { data: any[] };
    const rawNodes = nodesResponse.data;

    // Transition to Stage 2 (Edges Parentage) if nodes are fully exhausted
    if (rawNodes.length === 0) {
      console.log(`[TraceNodeResolver] Nodes completed. Transitioning to Edge Resolver for trace: ${traceId}`);
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "RESOLVE_EDGES",
          offset: 0,
          maxDepth,
          iteration: iteration + 1
        }
      });
      return;
    }

    // 2. Identify parents that are NOT in the current batch
    const localNodeMap = new Map<string, any>(rawNodes.map(n => [n.id, n]));
    const externalParentIds = new Set<string>();

    for (const row of rawNodes) {
      const depthIndex = Number(row.depthIndex);
      maxDepth = Math.max(maxDepth, depthIndex);

      if (row.parentNodeId && !localNodeMap.has(row.parentNodeId)) {
        externalParentIds.add(row.parentNodeId);
      }
    }

    // 3. Query node_ancestry for external parent paths
    const dbAncestryMap = new Map<string, string[]>();
    if (externalParentIds.size > 0) {
      const parentIdsArray = Array.from(externalParentIds);
      const ancestryResultSet = await this.clickHouse.client.query({
        query: `
          SELECT node_id, ancestryPath FROM toco_tracer.node_ancestry
          WHERE trace_id = {traceId: String}
            AND node_id IN ({parentIds: Array(String)})
        `,
        query_params: {
          traceId,
          parentIds: parentIdsArray,
        },
        format: "JSONEachRow",
      });

      const ancestryResponse = (await ancestryResultSet.json()) as unknown as { data: { node_id: string; ancestryPath: string[] }[] };
      for (const row of ancestryResponse.data) {
        dbAncestryMap.set(row.node_id, row.ancestryPath);
      }
    }

    // Cache of resolved paths in this call (both local and newly fetched/resolved)
    const resolvedPaths = new Map<string, string[]>();

    // Helper to get or resolve path for a node ID with max depth protection
    const resolvePath = async (nodeId: string, currentDepth: number = 0): Promise<string[]> => {
      if (currentDepth > MAX_DEPTH_LIMIT) {
        return [nodeId];
      }

      if (resolvedPaths.has(nodeId)) {
        return resolvedPaths.get(nodeId)!;
      }

      // Check db ancestry map
      if (dbAncestryMap.has(nodeId)) {
        const path = dbAncestryMap.get(nodeId)!;
        resolvedPaths.set(nodeId, path);
        return path;
      }

      // Check local node map
      const nodeObj = localNodeMap.get(nodeId);
      if (nodeObj) {
        if (!nodeObj.parentNodeId) {
          const path = [nodeId];
          resolvedPaths.set(nodeId, path);
          return path;
        }
        const parentPath = await resolvePath(nodeObj.parentNodeId, currentDepth + 1);
        const path = [...parentPath, nodeId];
        resolvedPaths.set(nodeId, path);
        return path;
      }

      // Fallback: Query primary nodes table for the parent hierarchy
      const fallbackResultSet = await this.clickHouse.client.query({
        query: `
          SELECT id, parentNodeId FROM toco_tracer.nodes
          WHERE trace_id = {traceId: String} AND id = {nodeId: String}
          LIMIT 1
        `,
        query_params: {
          traceId,
          nodeId,
        },
        format: "JSONEachRow",
      });
      const fallbackResponse = (await fallbackResultSet.json()) as unknown as { data: { id: string; parentNodeId: string }[] };
      if (fallbackResponse.data.length > 0) {
        const row = fallbackResponse.data[0]!;
        if (!row.parentNodeId) {
          const path = [nodeId];
          resolvedPaths.set(nodeId, path);
          return path;
        }
        const parentPath = await resolvePath(row.parentNodeId, currentDepth + 1);
        const path = [...parentPath, nodeId];
        resolvedPaths.set(nodeId, path);
        return path;
      }

      // Default fallback if node is completely missing
      const path = [nodeId];
      resolvedPaths.set(nodeId, path);
      return path;
    };

    // 4. Resolve path for all nodes in the batch
    const nodeAncestryToInsert: any[] = [];
    for (const row of rawNodes) {
      const path = await resolvePath(row.id);
      nodeAncestryToInsert.push({
        node_id: row.id,
        trace_id: traceId,
        ancestryPath: path,
      });
    }

    // 5. Bulk insert resolved paths into node_ancestry cache table
    if (nodeAncestryToInsert.length > 0) {
      await this.clickHouse.client.insert({
        table: "toco_tracer.node_ancestry",
        values: nodeAncestryToInsert,
        format: "JSONEachRow",
      });
    }

    // 6. Update trace metadata with latest offset
    await this.clickHouse.client.insert({
      table: "toco_tracer.trace_metadata",
      values: [{
        trace_id: traceId,
        is_zoom_ready: 0,
        max_available_depth: maxDepth,
        materialized_offset: offset + rawNodes.length,
      }],
      format: "JSONEachRow",
    });

    const isCompleted = rawNodes.length < BATCH_SIZE;

    if (isCompleted) {
      console.log(`[TraceNodeResolver] Nodes completed. Transitioning to Edge Resolver for trace: ${traceId}`);
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "RESOLVE_EDGES",
          offset: 0,
          maxDepth,
          iteration: iteration + 1
        }
      });
    } else {
      // Re-emit resolve nodes event for next chunk
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "RESOLVE_NODES",
          offset: offset + BATCH_SIZE,
          maxDepth,
          iteration: iteration + 1
        }
      });
    }
  }
}

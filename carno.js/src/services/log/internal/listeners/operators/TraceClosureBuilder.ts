import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../../infra/ClickHouseService";
import { MessageBroker } from "../../../../../infra/message/MessageBroker";

/**
 * TraceClosureBuilder (Stage 3 of Trace Materialization)
 * Generates snapped visual wires representing connections at every stack depth zoom level.
 *
 * DESIGN PRINCIPLES:
 * 1. Read-Optimized Snapping: Snaps connections for all depths from 0 to `maxDepth`
 *    (capped at 100).
 * 2. Visual Wire Generation:
 *    - At depth 0: snaps origin to the outermost physical parent (`container`).
 *    - At depth > 0: snaps origin to logical checkpoint (`node`), checking the egress ancestry path.
 * 3. Dedicated Read Table: Writes visual wires directly to `read_edges` using MergeTree.
 * 4. Completion Finalization: Upon completing all edge chunks, marks `is_zoom_ready = 1` in `trace_metadata`.
 */
@Service()
export class TraceClosureBuilder {
  constructor(
    private clickHouse: ClickHouseService,
    private messageBroker: MessageBroker
  ) {}

  /**
   * @param traceId Unique identifier for the trace.
   * @param offset Starting position for batch processing edges.
   * @param maxDepth Maximum stack depth level for the trace.
   * @param iteration Current step count in the materialization process.
   */
  async resolve(
    traceId: string,
    offset: number,
    maxDepth: number,
    iteration: number
  ): Promise<void> {
    console.log(`[TraceClosureBuilder] Processing closures for trace ${traceId} at offset ${offset}`);

    const BATCH_SIZE = 1000;
    const MAX_DEPTH_LIMIT = 100;

    // 1. Fetch raw edges in chunks
    const edgesResultSet = await this.clickHouse.client.query({
      query: `
        SELECT * FROM toco_tracer.edges
        WHERE trace_id = {traceId: String}
        ORDER BY dispatchedAtLocal ASC, id ASC
        LIMIT {limit: UInt32} OFFSET {offset: UInt32}
      `,
      query_params: {
        traceId,
        limit: BATCH_SIZE,
        offset,
      },
      format: "JSONEachRow",
    });

    const edgesResponse = (await edgesResultSet.json()) as unknown as { data: any[] };
    const rawEdges = edgesResponse.data;

    // Finalize zoom ready status once closures are completely built
    if (rawEdges.length === 0) {
      console.log(`[TraceClosureBuilder] Completed trace: ${traceId} (Max Depth: ${maxDepth})`);
      await this.clickHouse.client.insert({
        table: "toco_tracer.trace_metadata",
        values: [{
          trace_id: traceId,
          is_zoom_ready: 1,
          max_available_depth: maxDepth,
          materialized_offset: offset,
        }],
        format: "JSONEachRow",
      });
      return;
    }

    // 2. Fetch egress ancestry path from edge_egress_ancestry cache table for the batch of edges
    const edgeIds = rawEdges.map(e => e.id);
    const egressMap = new Map<string, string[]>();

    if (edgeIds.length > 0) {
      const egressResultSet = await this.clickHouse.client.query({
        query: `
          SELECT edge_id, egressAncestryPath FROM toco_tracer.edge_egress_ancestry
          WHERE trace_id = {traceId: String}
            AND edge_id IN ({edgeIds: Array(String)})
        `,
        query_params: {
          traceId,
          edgeIds,
        },
        format: "JSONEachRow",
      });

      const egressResponse = (await egressResultSet.json()) as unknown as { data: { edge_id: string; egressAncestryPath: string[] }[] };
      for (const row of egressResponse.data) {
        egressMap.set(row.edge_id, row.egressAncestryPath);
      }
    }

    const cappedMaxDepth = Math.min(maxDepth, MAX_DEPTH_LIMIT);
    const visualWiresToInsert: any[] = [];

    for (const row of rawEdges) {
      const egressAncestryPath = egressMap.get(row.id) || [];
      
      // SPARSE INSERT OPTIMIZATION (Fix for Issue #5)
      // We only insert a new visual wire if the origin target has actually changed
      // compared to the previous depth level. For any depth beyond the leaf node's
      // actual depth, the wire stays pinned to the leaf node, so we don't write duplicates.
      // The read query uses `ORDER BY visual_depth DESC LIMIT 1 BY edge_id` to find
      // the correct sparse row at query time.
      let lastFromTargetId = "";

      for (let d = 0; d <= cappedMaxDepth; d++) {
        let fromTargetId = row.fromContainerId;
        let fromTargetType = "container";

        if (d > 0) {
          if (d < egressAncestryPath.length) {
            fromTargetId = egressAncestryPath[d];
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

    if (visualWiresToInsert.length > 0) {
      await this.clickHouse.client.insert({
        table: "toco_tracer.read_edges",
        values: visualWiresToInsert,
        format: "JSONEachRow",
      });
    }

    const isCompleted = rawEdges.length < BATCH_SIZE;

    // Update metadata status progress
    await this.clickHouse.client.insert({
      table: "toco_tracer.trace_metadata",
      values: [{
        trace_id: traceId,
        is_zoom_ready: isCompleted ? 1 : 0,
        max_available_depth: maxDepth,
        materialized_offset: offset + rawEdges.length,
      }],
      format: "JSONEachRow",
    });

    if (isCompleted) {
      console.log(`[TraceClosureBuilder] Completed trace: ${traceId} (Max Depth: ${maxDepth})`);
    } else {
      // Re-emit build closures event for next chunk
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "BUILD_CLOSURES",
          offset: offset + BATCH_SIZE,
          maxDepth,
          iteration: iteration + 1
        }
      });
    }
  }
}

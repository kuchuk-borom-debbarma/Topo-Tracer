import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../../infra/ClickHouseService";
import { MessageBroker } from "../../../../../infra/message/MessageBroker";

/**
 * TraceEdgeResolver (Stage 2 of Trace Materialization)
 * Resolves the egress ancestry path of the originating node for network edges.
 *
 * DESIGN PRINCIPLES:
 * 1. Database-Backed Lookup: For each edge batch of 1000, we retrieve the cached origin
 *    ancestry paths directly from `node_ancestry` table using a single IN query.
 * 2. Dedicated Egress Table: Writes egress paths to the `edge_egress_ancestry` table.
 *    This avoids updating primary telemetry edges tables, preserving high ingestion rates
 *    and maintaining append-only patterns.
 * 3. Chunked Offset Propagation: Processes in increments of 1000. Re-publishes offset updates
 *    sequentially to preserve the server event loop.
 */
@Service()
export class TraceEdgeResolver {
  constructor(
    private clickHouse: ClickHouseService,
    private messageBroker: MessageBroker
  ) {}

  async resolve(
    traceId: string,
    offset: number,
    maxDepth: number,
    iteration: number
  ): Promise<void> {
    console.log(`[TraceEdgeResolver] Processing edges for trace ${traceId} at offset ${offset}`);

    const BATCH_SIZE = 1000;

    // 1. Fetch edges in chunks
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

    // Transition to Stage 3 (Visual Closures Builder) if edges are fully exhausted
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
          iteration: iteration + 1
        }
      });
      return;
    }

    // 2. Query node_ancestry for fromNodeId values of the edges batch
    const fromNodeIds = Array.from(new Set<string>(rawEdges.map(e => e.fromNodeId)));
    const ancestryMap = new Map<string, string[]>();

    if (fromNodeIds.length > 0) {
      const ancestryResultSet = await this.clickHouse.client.query({
        query: `
          SELECT node_id, ancestryPath FROM toco_tracer.node_ancestry
          WHERE trace_id = {traceId: String}
            AND node_id IN ({nodeIds: Array(String)})
        `,
        query_params: {
          traceId,
          nodeIds: fromNodeIds,
        },
        format: "JSONEachRow",
      });

      const ancestryResponse = (await ancestryResultSet.json()) as unknown as { data: { node_id: string; ancestryPath: string[] }[] };
      for (const row of ancestryResponse.data) {
        ancestryMap.set(row.node_id, row.ancestryPath);
      }
    }

    // Resolve egressAncestryPath for each edge and prepare bulk insert for edge_egress_ancestry
    const edgeEgressToInsert: any[] = [];
    for (const row of rawEdges) {
      const egressAncestryPath = ancestryMap.get(row.fromNodeId) || [];
      edgeEgressToInsert.push({
        edge_id: row.id,
        trace_id: traceId,
        egressAncestryPath,
      });
    }

    // Update edge_egress_ancestry in ClickHouse
    if (edgeEgressToInsert.length > 0) {
      await this.clickHouse.client.insert({
        table: "toco_tracer.edge_egress_ancestry",
        values: edgeEgressToInsert,
        format: "JSONEachRow",
      });
    }

    const isCompleted = rawEdges.length < BATCH_SIZE;

    if (isCompleted) {
      console.log(`[TraceEdgeResolver] Edges completed. Transitioning to Closure Builder for trace: ${traceId}`);
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "BUILD_CLOSURES",
          offset: 0,
          maxDepth,
          iteration: iteration + 1
        }
      });
    } else {
      // Re-emit resolve edges event for next chunk
      await this.messageBroker.publish({
        topic: "trace_materialization",
        key: traceId,
        payload: {
          traceId,
          stage: "RESOLVE_EDGES",
          offset: offset + BATCH_SIZE,
          maxDepth,
          iteration: iteration + 1
        }
      });
    }
  }
}

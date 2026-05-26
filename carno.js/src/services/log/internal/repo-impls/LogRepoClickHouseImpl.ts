import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import type { Container, Node, Edge, PaginationParams, PaginatedTraceResult } from "../../types";

@Service()
export class LogRepoClickHouseImpl extends LogRepo {
  constructor(private clickHouse: ClickHouseService) {
    super();
  }

  override async saveContainer(container: Container): Promise<void> {
    await this.saveContainers([container]);
  }

  override async saveContainers(containers: Container[]): Promise<void> {
    console.log(`[LogRepoClickHouseImpl] Saving batch of ${containers.length} containers to ClickHouse`);
    
    // Map dates to milliseconds (Int64 in database)
    const mappedContainers = containers.map(c => ({
      ...c,
      createdAtLocal: c.createdAtLocal.getTime(),
      createdAtRemote: c.createdAtRemote.getTime(),
    }));

    await this.clickHouse.client.insert({
      table: "toco_tracer.containers",
      values: mappedContainers,
      format: "JSONEachRow",
    });
  }

  override async saveNode(node: Node): Promise<void> {
    await this.saveNodes([node]);
  }

  override async saveNodes(nodes: Node[]): Promise<void> {
    console.log(`[LogRepoClickHouseImpl] Saving batch of ${nodes.length} nodes to ClickHouse`);

    // Map dates and serialize metadata to match ClickHouse schema
    const mappedNodes = nodes.map(n => ({
      ...n,
      metadata: typeof n.metadata === "object" ? JSON.stringify(n.metadata) : String(n.metadata || ""),
      initiatedAtLocal: n.initiatedAtLocal.getTime(),
      processedAtLocal: n.processedAtLocal.getTime(),
      completedAtLocal: n.completedAtLocal ? n.completedAtLocal.getTime() : null,
    }));

    await this.clickHouse.client.insert({
      table: "toco_tracer.nodes",
      values: mappedNodes,
      format: "JSONEachRow",
    });
  }

  override async saveEdge(edge: Edge): Promise<void> {
    await this.saveEdges([edge]);
  }

  override async saveEdges(edges: Edge[]): Promise<void> {
    console.log(`[LogRepoClickHouseImpl] Saving batch of ${edges.length} edges to ClickHouse`);

    // Map dates to milliseconds (Int64 in database)
    const mappedEdges = edges.map(e => ({
      ...e,
      dispatchedAtLocal: e.dispatchedAtLocal.getTime(),
      respondedAtLocal: e.respondedAtLocal ? e.respondedAtLocal.getTime() : null,
    }));

    await this.clickHouse.client.insert({
      table: "toco_tracer.edges",
      values: mappedEdges,
      format: "JSONEachRow",
    });
  }

  override async fetchTracePaginated(traceId: string, params: PaginationParams): Promise<PaginatedTraceResult> {
    // 1. Defensive Hard Limit Capping (Max 100 to protect server and database)
    const rawLimit = params.limit || 50;
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const fetchLimit = limit + 1; // Fetch 1 extra to determine hasNext/hasPrev

    let query = "";
    const queryParams: Record<string, any> = {
      traceId,
      fetchLimit,
    };

    const isBackward = params.beforeTime !== undefined;

    // 2. Build Bi-directional Keysets Seeks with (timestamp, id) composite keys on nodes table
    if (isBackward) {
      const beforeTime = params.beforeTime!;
      const beforeId = params.beforeId || "";
      query = `
        SELECT * FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
          AND (initiatedAtLocal < {beforeTime: Int64} OR (initiatedAtLocal = {beforeTime: Int64} AND id < {beforeId: String}))
        ORDER BY initiatedAtLocal DESC, id DESC
        LIMIT {fetchLimit: UInt32}
      `;
      queryParams.beforeTime = beforeTime;
      queryParams.beforeId = beforeId;
    } else if (params.afterTime !== undefined) {
      const afterTime = params.afterTime!;
      const afterId = params.afterId || "";
      query = `
        SELECT * FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
          AND (initiatedAtLocal > {afterTime: Int64} OR (initiatedAtLocal = {afterTime: Int64} AND id > {afterId: String}))
        ORDER BY initiatedAtLocal ASC, id ASC
        LIMIT {fetchLimit: UInt32}
      `;
      queryParams.afterTime = afterTime;
      queryParams.afterId = afterId;
    } else {
      query = `
        SELECT * FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
        ORDER BY initiatedAtLocal ASC, id ASC
        LIMIT {fetchLimit: UInt32}
      `;
    }

    const resultSet = await this.clickHouse.client.query({
      query,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const response = (await resultSet.json()) as unknown as { data: any[] };
    const rawRows = response.data;

    // 3. Map returned fields and convert timestamps back to Date instances
    const mappedRows: Node[] = rawRows.map(row => ({
      id: row.id,
      containerId: row.containerId,
      parentNodeId: row.parentNodeId,
      name: row.name,
      nodeType: row.nodeType,
      depthIndex: Number(row.depthIndex),
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      initiatedAtLocal: new Date(Number(row.initiatedAtLocal)),
      processedAtLocal: new Date(Number(row.processedAtLocal)),
      completedAtLocal: row.completedAtLocal ? new Date(Number(row.completedAtLocal)) : undefined,
    }));

    // 4. Calculate pagination indicators and slice to final nodes
    let nodes: Node[] = [];
    let hasPrev = false;
    let hasNext = false;

    if (isBackward) {
      const moreExist = mappedRows.length > limit;
      nodes = moreExist ? mappedRows.slice(0, limit) : mappedRows;
      hasPrev = moreExist;
      hasNext = true;
      nodes.reverse(); // Reverse back to standard chronological order
    } else {
      const moreExist = mappedRows.length > limit;
      nodes = moreExist ? mappedRows.slice(0, limit) : mappedRows;
      hasNext = moreExist;
      hasPrev = params.afterTime !== undefined;
    }

    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    
    const prevTimeCursor = firstNode ? firstNode.initiatedAtLocal.getTime() : null;
    const prevIdCursor = firstNode ? firstNode.id : null;
    const nextTimeCursor = lastNode ? lastNode.initiatedAtLocal.getTime() : null;
    const nextIdCursor = lastNode ? lastNode.id : null;

    // 5. Query matching Edges with strict graph coherence (AND IN)
    let edges: Edge[] = [];
    if (nodes.length > 0) {
      const nodeIds = nodes.map(n => n.id);
      const edgesResultSet = await this.clickHouse.client.query({
        query: `
          SELECT * FROM toco_tracer.edges
          WHERE trace_id = {traceId: String}
            AND fromNodeId IN {nodeIds: Array(String)}
            AND toNodeId IN {nodeIds: Array(String)}
        `,
        query_params: {
          traceId,
          nodeIds,
        },
        format: "JSONEachRow",
      });

      const edgesResponse = (await edgesResultSet.json()) as unknown as { data: any[] };
      const rawEdges = edgesResponse.data;

      edges = rawEdges.map(row => ({
        id: row.id,
        fromContainerId: row.fromContainerId,
        toContainerId: row.toContainerId,
        fromNodeId: row.fromNodeId,
        toNodeId: row.toNodeId,
        edgeType: row.edgeType,
        dispatchedAtLocal: new Date(Number(row.dispatchedAtLocal)),
        respondedAtLocal: row.respondedAtLocal ? new Date(Number(row.respondedAtLocal)) : undefined,
      }));
    }

    return {
      nodes,
      edges,
      pagination: {
        prevTimeCursor,
        prevIdCursor,
        nextTimeCursor,
        nextIdCursor,
        hasPrev,
        hasNext,
      },
    };
  }
}




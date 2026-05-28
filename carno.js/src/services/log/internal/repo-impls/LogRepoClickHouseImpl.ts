import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import { MessageBroker } from "../../../../infra/message/MessageBroker";
import type { Container, Node, Edge, PaginationParams, PaginatedTraceResult, VisualWire } from "../../types";

@Service()
export class LogRepoClickHouseImpl extends LogRepo {
  private static triggeredTraces = new Set<string>();

  constructor(
    private clickHouse: ClickHouseService,
    private messageBroker?: MessageBroker
  ) {
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
      createdAtLocal: new Date(c.createdAtLocal).getTime(),
      createdAtRemote: new Date(c.createdAtRemote).getTime(),
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

    // Map dates, trace correlation and serialize metadata to match ClickHouse schema
    const mappedNodes = nodes.map(n => ({
      ...n,
      trace_id: n.traceId,
      group: n.group || "",
      metadata: typeof n.metadata === "object" ? JSON.stringify(n.metadata) : String(n.metadata || ""),

      initiatedAtLocal: new Date(n.initiatedAtLocal).getTime(),
      processedAtLocal: new Date(n.processedAtLocal).getTime(),
      completedAtLocal: n.completedAtLocal ? new Date(n.completedAtLocal).getTime() : null,
      ancestryPath: n.ancestryPath || [],
      localDepthIndex: n.localDepthIndex || 0,
      scheduledAtLocal: n.scheduledAtLocal ? new Date(n.scheduledAtLocal).getTime() : null,
      cpuActiveDurationUs: n.cpuActiveDurationUs !== undefined ? Number(n.cpuActiveDurationUs) : null,
      suspendedAtLocal: (n.suspendedAtLocal || []).map(d => new Date(d).getTime()),
      resumedAtLocal: (n.resumedAtLocal || []).map(d => new Date(d).getTime()),
    }));

    await this.clickHouse.client.insert({
      table: "toco_tracer.nodes",
      values: mappedNodes,
      format: "JSONEachRow",
    });

    // Proactively trigger background materialization for all distinct traceIds in this batch
    const distinctTraceIds = Array.from(new Set(nodes.map(n => n.traceId))).filter(Boolean);
    for (const traceId of distinctTraceIds) {
      this.triggerMaterialization(traceId).catch(err => {
        console.error(`[LogRepoClickHouseImpl] Failed to trigger materialization for write: ${traceId}`, err);
      });
    }
  }

  override async saveEdge(edge: Edge): Promise<void> {
    await this.saveEdges([edge]);
  }

  override async saveEdges(edges: Edge[]): Promise<void> {
    console.log(`[LogRepoClickHouseImpl] Saving batch of ${edges.length} edges to ClickHouse`);

    // Map dates and trace correlation to match ClickHouse schema
    const mappedEdges = edges.map(e => ({
      ...e,
      trace_id: e.traceId,
      dispatchedAtLocal: new Date(e.dispatchedAtLocal).getTime(),
      respondedAtLocal: e.respondedAtLocal ? new Date(e.respondedAtLocal).getTime() : null,
      egressAncestryPath: e.egressAncestryPath || [],
    }));

    await this.clickHouse.client.insert({
      table: "toco_tracer.edges",
      values: mappedEdges,
      format: "JSONEachRow",
    });

    // Proactively trigger background materialization for all distinct traceIds in this batch
    const distinctTraceIds = Array.from(new Set(edges.map(e => e.traceId))).filter(Boolean);
    for (const traceId of distinctTraceIds) {
      this.triggerMaterialization(traceId).catch(err => {
        console.error(`[LogRepoClickHouseImpl] Failed to trigger materialization for write: ${traceId}`, err);
      });
    }
  }

  private async ensureMaterialized(traceId: string): Promise<{ isZoomReady: boolean; maxAvailableDepth: number; maxAvailableLocalDepth: number }> {
    // Query the latest materialization status from trace_metadata
    const metadataResultSet = await this.clickHouse.client.query({
      query: `
        SELECT is_zoom_ready, max_available_depth, max_available_local_depth FROM toco_tracer.trace_metadata
        WHERE trace_id = {traceId: String}
        ORDER BY is_zoom_ready DESC, max_available_depth DESC
        LIMIT 1
      `,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const metadataResponse = (await metadataResultSet.json()) as unknown as { is_zoom_ready: number; max_available_depth: number; max_available_local_depth: number }[];
    
    if (metadataResponse.length > 0) {
      const meta = metadataResponse[0]!;
      const isZoomReady = meta.is_zoom_ready === 1;
      
      if (!isZoomReady) {
        await this.triggerMaterialization(traceId);
      }
      
      return {
        isZoomReady,
        maxAvailableDepth: Number(meta.max_available_depth),
        maxAvailableLocalDepth: Number(meta.max_available_local_depth || 0),
      };
    } else {
      // Trigger background materialization if metadata is missing
      await this.triggerMaterialization(traceId);
      return {
        isZoomReady: false,
        maxAvailableDepth: 0,
        maxAvailableLocalDepth: 0,
      };
    }
  }

  private async triggerMaterialization(traceId: string): Promise<void> {
    if (!traceId || !this.messageBroker) {
      return;
    }
    if (LogRepoClickHouseImpl.triggeredTraces.has(traceId)) {
      return;
    }
    LogRepoClickHouseImpl.triggeredTraces.add(traceId);
    setTimeout(() => {
      LogRepoClickHouseImpl.triggeredTraces.delete(traceId);
    }, 15000); // 15s debounce window

    console.log(`[LogRepoClickHouseImpl] Triggering trace materialization for: ${traceId}`);
    await this.messageBroker.publish({
      topic: "trace_materialization",
      key: traceId,
      payload: {
        traceId,
        stage: "RESOLVE_NODES",
        offset: 0,
        maxDepth: 0,
        iteration: 1,
      },
    });
  }

  override async fetchTraceMetadata(traceId: string): Promise<import("../../types").TraceMetadataResult> {
    return await this.ensureMaterialized(traceId);
  }

  override async fetchTrace(traceId: string, depthFilterThreshold: number = 0, depthType: 'global' | 'local' = 'global'): Promise<import("../../types").FullTraceResult> {


    const { isZoomReady, maxAvailableDepth, maxAvailableLocalDepth } = await this.ensureMaterialized(traceId);
    
    // Fallback while materializing
    if (!isZoomReady) {
      return {
        nodes: [],
        edges: [],
        isZoomReady: false,
        maxAvailableDepth,
        maxAvailableLocalDepth
      };
    }

    const readEdgesRs = await this.clickHouse.client.query({
      query: `
        SELECT * FROM toco_tracer.read_edges 
        WHERE trace_id = {traceId: String} AND visual_depth = {depth: UInt32} AND depth_type = {depthType: String}
      `,
      query_params: { traceId, depth: depthFilterThreshold, depthType },
      format: "JSONEachRow"
    });
    
    // ... logic continues ...
    return {} as any;
  }

  override async fetchTraceFull(traceId: string, depth?: number, depthType: 'global' | 'local' = 'global'): Promise<import("../../types").FullTraceResult> {
    const { isZoomReady, maxAvailableDepth, maxAvailableLocalDepth } = await this.ensureMaterialized(traceId);

    const hasDepthFilter = depth !== undefined;
    const depthColumn = depthType === 'local' ? 'localDepthIndex' : 'depthIndex';
    const depthFilterClause = hasDepthFilter ? `AND ${depthColumn} <= {depth: UInt32}` : "";

    const query = `
      SELECT * FROM toco_tracer.nodes
      WHERE trace_id = {traceId: String}
        ${depthFilterClause}
      ORDER BY initiatedAtLocal ASC, id ASC
    `;

    const queryParams: Record<string, any> = { traceId };
    if (hasDepthFilter) {
      queryParams.depth = depth;
    }

    const resultSet = await this.clickHouse.client.query({
      query,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const rawRows = (await resultSet.json()) as any[];

    const nodes: Node[] = rawRows.map(row => ({
      id: row.id,
      traceId: row.trace_id,
      containerId: row.containerId,
      parentNodeId: row.parentNodeId,
      name: row.name,
      nodeType: row.nodeType,
      depthIndex: Number(row.depthIndex),
      localDepthIndex: Number(row.localDepthIndex || 0),
      group: row.group || "",
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      initiatedAtLocal: new Date(Number(row.initiatedAtLocal)),
      processedAtLocal: new Date(Number(row.processedAtLocal)),
      completedAtLocal: row.completedAtLocal ? new Date(Number(row.completedAtLocal)) : undefined,
      scheduledAtLocal: row.scheduledAtLocal ? new Date(Number(row.scheduledAtLocal)) : undefined,
      cpuActiveDurationUs: row.cpuActiveDurationUs !== null && row.cpuActiveDurationUs !== undefined ? Number(row.cpuActiveDurationUs) : undefined,
      suspendedAtLocal: Array.isArray(row.suspendedAtLocal) ? row.suspendedAtLocal.map((t: any) => new Date(Number(t))) : [],
      resumedAtLocal: Array.isArray(row.resumedAtLocal) ? row.resumedAtLocal.map((t: any) => new Date(Number(t))) : [],
    }));

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
        query_params: { traceId, nodeIds },
        format: "JSONEachRow",
      });

      const rawEdges = (await edgesResultSet.json()) as any[];

      edges = rawEdges.map(row => ({
        id: row.id,
        traceId: row.trace_id,
        fromContainerId: row.fromContainerId,
        toContainerId: row.toContainerId,
        fromNodeId: row.fromNodeId,
        toNodeId: row.toNodeId,
        edgeType: row.edgeType,
        dispatchedAtLocal: new Date(Number(row.dispatchedAtLocal)),
        respondedAtLocal: row.respondedAtLocal ? new Date(Number(row.respondedAtLocal)) : undefined,
      }));
    }

    let visualWires: VisualWire[] | undefined = undefined;
    if (hasDepthFilter) {
      const readEdgesResultSet = await this.clickHouse.client.query({
        query: `
          SELECT * FROM toco_tracer.read_edges
          WHERE trace_id = {traceId: String}
            AND depth_type = {depthType: String}
            AND visual_depth <= {depth: UInt32}
          ORDER BY visual_depth DESC
          LIMIT 1 BY edge_id
        `,
        query_params: { traceId, depth: depth!, depthType },
        format: "JSONEachRow",
      });

      const rawReadEdges = (await readEdgesResultSet.json()) as any[];

      // Map the pre-computed sparse closure rows into UI-ready visual wires.
      // Notice both fromTarget and toTarget use dynamic types to snap to containers when nodes are hidden.
      visualWires = rawReadEdges.map(row => ({
        id: row.id,
        fromTarget: { id: row.from_target_id, type: row.from_target_type as "node" | "container" },
        toTarget: { id: row.to_target_id, type: row.to_target_type as "node" | "container" },
      }));
    }

    return {
      nodes,
      edges,
      visualWires,
      isZoomReady,
      maxAvailableDepth,
      maxAvailableLocalDepth,
    };
  }

  override async fetchTracePaginated(traceId: string, params: PaginationParams): Promise<PaginatedTraceResult> {
    // 1. Ensure trace is materialized (triggers background worker if needed)
    const { isZoomReady, maxAvailableDepth } = await this.ensureMaterialized(traceId);

    // 2. Defensive Hard Limit Capping (Max 100 to protect server and database)
    const rawLimit = params.limit || 50;
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const fetchLimit = limit + 1; // Fetch 1 extra to determine hasNext/hasPrev

    let query = "";
    const queryParams: Record<string, any> = {
      traceId,
      fetchLimit,
    };

    const isBackward = params.beforeTime !== undefined;
    const hasDepthFilter = params.depth !== undefined;
    const depthType = params.depthType || 'global';
    const depthColumn = depthType === 'local' ? 'localDepthIndex' : 'depthIndex';
    const depthFilterClause = hasDepthFilter ? `AND ${depthColumn} <= {depth: UInt32}` : "";
    if (hasDepthFilter) {
      queryParams.depth = params.depth;
    }

    // 3. Build Bi-directional Keysets Seeks with (timestamp, id) composite keys
    if (isBackward) {
      const beforeTime = params.beforeTime!;
      const beforeId = params.beforeId || "";
      query = `
        SELECT * FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
          ${depthFilterClause}
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
          ${depthFilterClause}
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
          ${depthFilterClause}
        ORDER BY initiatedAtLocal ASC, id ASC
        LIMIT {fetchLimit: UInt32}
      `;
    }

    const resultSet = await this.clickHouse.client.query({
      query,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const rawRows = (await resultSet.json()) as any[];

    // 4. Map returned fields and convert timestamps back to Date instances
    const mappedRows: Node[] = rawRows.map(row => ({
      id: row.id,
      traceId: row.trace_id,
      containerId: row.containerId,
      parentNodeId: row.parentNodeId,
      name: row.name,
      nodeType: row.nodeType,
      depthIndex: Number(row.depthIndex),
      localDepthIndex: Number(row.localDepthIndex || 0),
      group: row.group || "",
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      initiatedAtLocal: new Date(Number(row.initiatedAtLocal)),
      processedAtLocal: new Date(Number(row.processedAtLocal)),
      completedAtLocal: row.completedAtLocal ? new Date(Number(row.completedAtLocal)) : undefined,
      scheduledAtLocal: row.scheduledAtLocal ? new Date(Number(row.scheduledAtLocal)) : undefined,
      cpuActiveDurationUs: row.cpuActiveDurationUs !== null && row.cpuActiveDurationUs !== undefined ? Number(row.cpuActiveDurationUs) : undefined,
      suspendedAtLocal: Array.isArray(row.suspendedAtLocal) ? row.suspendedAtLocal.map((t: any) => new Date(Number(t))) : [],
      resumedAtLocal: Array.isArray(row.resumedAtLocal) ? row.resumedAtLocal.map((t: any) => new Date(Number(t))) : [],
    }));

    // 5. Calculate pagination indicators and slice to final nodes
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

    // 6. Query matching Edges with strict graph coherence (AND IN)
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

      const rawEdges = (await edgesResultSet.json()) as any[];

      edges = rawEdges.map(row => ({
        id: row.id,
        traceId: row.trace_id,
        fromContainerId: row.fromContainerId,
        toContainerId: row.toContainerId,
        fromNodeId: row.fromNodeId,
        toNodeId: row.toNodeId,
        edgeType: row.edgeType,
        dispatchedAtLocal: new Date(Number(row.dispatchedAtLocal)),
        respondedAtLocal: row.respondedAtLocal ? new Date(Number(row.respondedAtLocal)) : undefined,
      }));
    }

    // 7. Query pre-computed visual wires if zoom ready and depth is requested
    let visualWires: VisualWire[] | undefined = undefined;
    if (hasDepthFilter) {
      const readEdgesResultSet = await this.clickHouse.client.query({
        query: `
          SELECT * FROM toco_tracer.read_edges
          WHERE trace_id = {traceId: String}
            AND depth_type = {depthType: String}
            AND visual_depth <= {depth: UInt32}
          ORDER BY visual_depth DESC
          LIMIT 1 BY edge_id
        `,
        query_params: {
          traceId,
          depth: params.depth!,
          depthType: params.depthType || 'global'
        },
        format: "JSONEachRow",
      });

      const rawReadEdges = (await readEdgesResultSet.json()) as any[];

      // Map the pre-computed sparse closure rows into UI-ready visual wires.
      // Notice both fromTarget and toTarget use dynamic types to snap to containers when nodes are hidden.
      visualWires = rawReadEdges.map(row => ({
        id: row.id,
        fromTarget: { id: row.from_target_id, type: row.from_target_type as "node" | "container" },
        toTarget: { id: row.to_target_id, type: row.to_target_type as "node" | "container" },
      }));
    }

    return {
      nodes,
      edges,
      visualWires,
      isZoomReady,
      maxAvailableDepth,
      pagination: {
        prevTimeCursor: hasPrev ? nodes[0]!.initiatedAtLocal.getTime() : null,
        prevIdCursor: hasPrev ? nodes[0]!.id : null,
        nextTimeCursor: hasNext ? nodes[nodes.length - 1]!.initiatedAtLocal.getTime() : null,
        nextIdCursor: hasNext ? nodes[nodes.length - 1]!.id : null,
        hasPrev,
        hasNext,
      },
    };
  }

  // --- Materialization Engine Methods ---

  override async fetchNodesForMaterialization(traceId: string, limit: number, offset: number): Promise<import("../../types").NodeMaterializationDTO[]> {
    const rs = await this.clickHouse.client.query({
      query: `
        SELECT id, parentNodeId, depthIndex, localDepthIndex FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
        ORDER BY initiatedAtLocal ASC, id ASC
        LIMIT {limit: UInt32} OFFSET {offset: UInt32}
      `,
      query_params: { traceId, limit, offset },
      format: "JSONEachRow",
    });
    return (await rs.json()) as any[];
  }

  override async fetchNodeAncestry(traceId: string, nodeIds: string[]): Promise<import("../../types").NodeAncestryRecord[]> {
    if (!nodeIds.length) return [];
    const rs = await this.clickHouse.client.query({
      query: `
        SELECT node_id, ancestryPath, ancestryDepths, ancestryLocalDepths FROM toco_tracer.node_ancestry
        WHERE trace_id = {traceId: String} AND node_id IN ({nodeIds: Array(String)})
      `,
      query_params: { traceId, nodeIds },
      format: "JSONEachRow",
    });
    return (await rs.json()) as any[];
  }

  override async fetchNodesByIds(traceId: string, nodeIds: string[]): Promise<import("../../types").NodeMaterializationDTO[]> {
    if (!nodeIds.length) return [];
    const rs = await this.clickHouse.client.query({
      query: `
        SELECT id, parentNodeId, depthIndex, localDepthIndex FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String} AND id IN ({missingIds: Array(String)})
      `,
      query_params: { traceId, missingIds: nodeIds },
      format: "JSONEachRow",
    });
    return (await rs.json()) as any[];
  }

  override async saveNodeAncestryBatch(traceId: string, records: import("../../types").NodeAncestryRecord[]): Promise<void> {
    if (!records.length) return;
    const values = records.map(r => ({
      node_id: r.node_id,
      trace_id: traceId,
      ancestryPath: r.ancestryPath,
      ancestryDepths: r.ancestryDepths,
      ancestryLocalDepths: r.ancestryLocalDepths
    }));
    await this.clickHouse.client.insert({
      table: "toco_tracer.node_ancestry",
      values,
      format: "JSONEachRow"
    });
  }

  override async fetchEdgesForMaterialization(traceId: string, limit: number, offset: number): Promise<import("../../types").EdgeMaterializationDTO[]> {
    const rs = await this.clickHouse.client.query({
      query: `
        SELECT id, fromNodeId, toNodeId, fromContainerId, toContainerId FROM toco_tracer.edges
        WHERE trace_id = {traceId: String}
        ORDER BY dispatchedAtLocal ASC, id ASC
        LIMIT {limit: UInt32} OFFSET {offset: UInt32}
      `,
      query_params: { traceId, limit, offset },
      format: "JSONEachRow",
    });
    return (await rs.json()) as any[];
  }

  override async saveEdgeEgressAncestryBatch(traceId: string, records: import("../../types").EdgeEgressAncestryRecord[]): Promise<void> {
    if (!records.length) return;
    const values = records.map(r => ({
      edge_id: r.edge_id,
      trace_id: traceId,
      egressAncestryPath: r.egressAncestryPath,
      egressAncestryDepths: r.egressAncestryDepths,
      egressAncestryLocalDepths: r.egressAncestryLocalDepths
    }));
    await this.clickHouse.client.insert({
      table: "toco_tracer.edge_egress_ancestry",
      values,
      format: "JSONEachRow"
    });
  }

  override async fetchEdgeEgressAncestry(traceId: string, edgeIds: string[]): Promise<import("../../types").EdgeEgressAncestryRecord[]> {
    if (!edgeIds.length) return [];
    const rs = await this.clickHouse.client.query({
      query: `
        SELECT edge_id, egressAncestryPath, egressAncestryDepths, egressAncestryLocalDepths FROM toco_tracer.edge_egress_ancestry
        WHERE trace_id = {traceId: String} AND edge_id IN ({edgeIds: Array(String)})
      `,
      query_params: { traceId, edgeIds },
      format: "JSONEachRow",
    });
    return (await rs.json()) as any[];
  }

  override async saveVisualWiresBatch(traceId: string, wires: any[]): Promise<void> {
    if (!wires.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_edges",
      values: wires,
      format: "JSONEachRow"
    });
  }

  override async updateTraceMaterializationMetadata(traceId: string, updates: import("../../types").TraceMetadataUpdate): Promise<void> {
    const current = await this.fetchTraceMetadata(traceId);
    await this.clickHouse.client.insert({
      table: "toco_tracer.trace_metadata",
      values: [{
        trace_id: traceId,
        max_available_depth: updates.max_available_depth !== undefined ? updates.max_available_depth : current.maxAvailableDepth,
        max_available_local_depth: updates.max_available_local_depth !== undefined ? updates.max_available_local_depth : current.maxAvailableLocalDepth,
        is_zoom_ready: updates.is_zoom_ready !== undefined ? (updates.is_zoom_ready ? 1 : 0) : (current.isZoomReady ? 1 : 0)
      }],
      format: "JSONEachRow"
    });
  }
}

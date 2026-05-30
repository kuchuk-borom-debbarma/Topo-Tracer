import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import { LogRepo } from "../LogRepo";
import type { 
  TraceBlock, 
  TraceContainer, 
  TraceEdge, 
  TraceNode, 
  ReadBlock, 
  ReadNode, 
  ReadEdge, 
  TraceMetadata, 
  TraceNodeCollapsed 
} from "../../types";

@Service()
export class LogRepoClickHouseImpl extends LogRepo {
  constructor(private clickHouse: ClickHouseService) {
    super();
  }

  override async saveContainers(containers: TraceContainer[]): Promise<void> {
    if (!containers.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.containers",
      values: containers.map(container => ({
        id: container.id,
        trace_id: container.traceId,
        name: container.name,
        type: container.type,
        metadata: stringifyJson(container.metadata),
        createdAtLocal: container.createdAtLocal.getTime(),
        createdAtRemote: container.createdAtRemote.getTime(),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveBlocks(blocks: TraceBlock[]): Promise<void> {
    if (!blocks.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.blocks",
      values: blocks.map(block => ({
        id: block.id,
        trace_id: block.traceId,
        containerId: block.containerId,
        name: block.name,
        type: block.type,
        metadata: stringifyJson(block.metadata),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveNodes(nodes: TraceNode[]): Promise<void> {
    if (!nodes.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.nodes",
      values: nodes.map(node => ({
        id: node.id,
        trace_id: node.traceId,
        blockId: node.blockId,
        name: node.name,
        type: node.type,
        metadata: stringifyJson(node.metadata),
        eventType: node.eventType,
        eventAtLocal: node.eventAtLocal.getTime(),
        ingestedAtRemote: node.ingestedAtRemote.getTime(),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    if (!edges.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.edges",
      values: edges.map(edge => ({
        id: edge.id,
        trace_id: edge.traceId,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        type: edge.type,
        metadata: stringifyJson(edge.metadata),
        eventType: edge.eventType,
        eventAtLocal: edge.eventAtLocal.getTime(),
        ingestedAtRemote: edge.ingestedAtRemote.getTime(),
      })),
      format: "JSONEachRow",
    });
  }

  override async fetchContainers(traceId: string): Promise<TraceContainer[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, name, type, metadata, toDateTime(createdAtLocal/1000) as createdAtLocal FROM toco_tracer.containers WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    return result.json();
  }

  override async fetchBlocks(traceId: string): Promise<TraceBlock[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, containerId, name, type, metadata FROM toco_tracer.blocks WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    return result.json();
  }

  override async fetchCollapsedNodes(traceId: string): Promise<TraceNodeCollapsed[]> {
    const result = await this.clickHouse.client.query({
      query: `
        SELECT
          id,
          blockId,
          name,
          type,
          metadata,
          minIf(eventAtLocal, eventType = 'started') AS startTimeUs,
          maxIf(eventAtLocal, eventType = 'ended') AS endTimeUs,
          if(endTimeUs > 0, endTimeUs - startTimeUs, null) AS durationUs
        FROM toco_tracer.nodes
        WHERE trace_id = {traceId: String}
        GROUP BY id, blockId, name, type, metadata
      `,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    return result.json<TraceNodeCollapsed[]>();
  }

  override async fetchRawEdges(traceId: string): Promise<TraceEdge[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, fromNodeId, toNodeId, type, metadata, eventType, toDateTime(eventAtLocal/1000) as eventAtLocal FROM toco_tracer.edges WHERE trace_id = {traceId: String} AND eventType = 'requested'`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    return result.json<TraceEdge[]>();
  }

  override async saveReadBlocks(blocks: ReadBlock[]): Promise<void> {
    if (!blocks.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_blocks",
      values: blocks,
      format: "JSONEachRow",
    });
  }

  override async saveReadNodes(nodes: ReadNode[]): Promise<void> {
    if (!nodes.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_nodes",
      values: nodes,
      format: "JSONEachRow",
    });
  }

  override async saveReadEdges(edges: ReadEdge[]): Promise<void> {
    if (!edges.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_edges",
      values: edges,
      format: "JSONEachRow",
    });
  }

  override async saveTraceMetadata(metadata: TraceMetadata): Promise<void> {
    await this.clickHouse.client.insert({
      table: "toco_tracer.trace_metadata",
      values: [{
        trace_id: metadata.traceId,
        is_zoom_ready: metadata.isZoomReady ? 1 : 0,
        max_available_depth: metadata.maxAvailableDepth,
        materialized_offset: metadata.materializedOffset,
      }],
      format: "JSONEachRow",
    });
  }

  override async fetchTraceMetadata(traceId: string): Promise<TraceMetadata | null> {
    const result = await this.clickHouse.client.query({
      query: `SELECT trace_id as traceId, is_zoom_ready as isZoomReady, max_available_depth as maxAvailableDepth, materialized_offset as materializedOffset FROM toco_tracer.trace_metadata WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<TraceMetadata[]>();
    return rows[0] || null;
  }

  override async fetchReadBlocks(traceId: string): Promise<ReadBlock[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, container_id as containerId, parent_block_id as parentBlockId, calling_node_id as callingNodeId, name, type, absolute_depth as absoluteDepth, start_time_us as startTimeUs, duration_us as durationUs, ancestry_path as ancestryPath, metadata FROM toco_tracer.read_blocks WHERE trace_id = {traceId: String} ORDER BY absolute_depth ASC, start_time_us ASC`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    return result.json<ReadBlock[]>();
  }

  override async fetchReadNodes(traceId: string, zoomLevel: number): Promise<ReadNode[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, block_id as blockId, name, type, zoom_level as zoomLevel, local_sequence as localSequence, start_time_us as startTimeUs, duration_us as durationUs, ancestry_path as ancestryPath, metadata FROM toco_tracer.read_nodes WHERE trace_id = {traceId: String} AND zoom_level <= {zoomLevel: UInt8} ORDER BY block_id, local_sequence ASC`,
      query_params: { traceId, zoomLevel },
      format: "JSONEachRow",
    });
    return result.json<ReadNode[]>();
  }

  override async fetchReadEdges(traceId: string): Promise<ReadEdge[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, edge_id as edgeId, trace_id as traceId, from_block_id as fromBlockId, from_node_id as fromNodeId, to_block_id as toBlockId, to_node_id as toNodeId FROM toco_tracer.read_edges WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    return result.json<ReadEdge[]>();
  }
}




function stringifyJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

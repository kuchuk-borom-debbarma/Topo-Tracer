import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import { LogRepo } from "../LogRepo";
import type { 
  TraceContainer, 
  TraceEdge, 
  TraceNode, 
  ReadContainer, 
  ReadNode, 
  ReadEdge, 
  TraceMetadata, 
  TraceListItem
} from "../../types";

@Service()
export class LogRepoClickHouseImpl extends LogRepo {
  constructor(private clickHouse: ClickHouseService) {
    super();
  }

  override async saveContainers(containers: TraceContainer[]): Promise<void> {
    if (!containers.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.raw_containers",
      values: containers.map(container => ({
        id: container.id,
        trace_id: container.traceId,
        parent_container_id: container.parentContainerId ?? "",
        name: container.name,
        type: container.type,
        tags: container.tags,
        event_type: container.eventType,
        timestamp: container.timestamp.getTime(),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveNodes(nodes: TraceNode[]): Promise<void> {
    if (!nodes.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.raw_nodes",
      values: nodes.map(node => ({
        id: node.id,
        trace_id: node.traceId,
        container_id: node.containerId,
        name: node.name,
        type: node.type,
        tags: node.tags,
        event_type: node.eventType,
        timestamp: node.timestamp.getTime(),
        metadata: stringifyJson(node.metadata),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    if (!edges.length) return;

    await this.clickHouse.client.insert({
      table: "toco_tracer.raw_edges",
      values: edges.map(edge => ({
        id: edge.id,
        trace_id: edge.traceId,
        from_node_id: edge.fromNodeId,
        to_node_id: edge.toNodeId,
        type: edge.type,
        timestamp: edge.timestamp.getTime(),
      })),
      format: "JSONEachRow",
    });
  }

  override async fetchContainers(traceId: string): Promise<TraceContainer[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, parent_container_id as parentContainerId, name, type, tags, event_type as eventType, timestamp FROM toco_tracer.raw_containers WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      timestamp: new Date(Number(r.timestamp)),
      parentContainerId: r.parentContainerId || null,
    }));
  }

  override async fetchNodes(traceId: string): Promise<TraceNode[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, container_id as containerId, name, type, tags, event_type as eventType, timestamp, metadata FROM toco_tracer.raw_nodes WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      timestamp: new Date(Number(r.timestamp)),
      metadata: r.metadata ? parseJson(r.metadata) : null,
    }));
  }

  override async fetchRawEdges(traceId: string): Promise<TraceEdge[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, from_node_id as fromNodeId, to_node_id as toNodeId, type, timestamp FROM toco_tracer.raw_edges WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      timestamp: new Date(Number(r.timestamp)),
    }));
  }

  override async saveReadContainers(containers: ReadContainer[]): Promise<void> {
    if (!containers.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_containers",
      values: containers.map(c => ({
        id: c.id,
        trace_id: c.traceId,
        parent_container_id: c.parentContainerId ?? "",
        name: c.name,
        type: c.type,
        tags: c.tags,
        start_time_us: c.startTimeUs,
        duration_us: c.durationUs,
        metadata: stringifyJson(c.metadata),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveReadNodes(nodes: ReadNode[]): Promise<void> {
    if (!nodes.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_nodes",
      values: nodes.map(n => ({
        id: n.id,
        trace_id: n.traceId,
        container_id: n.containerId,
        name: n.name,
        type: n.type,
        tags: n.tags,
        parentage: n.parentage,
        local_sequence: n.localSequence,
        start_time_us: n.startTimeUs,
        duration_us: n.durationUs,
        metadata: stringifyJson(n.metadata),
      })),
      format: "JSONEachRow",
    });
  }

  override async saveReadEdges(edges: ReadEdge[]): Promise<void> {
    if (!edges.length) return;
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_edges",
      values: edges.map(e => ({
        id: e.id,
        trace_id: e.traceId,
        from_node_id: e.fromNodeId,
        to_node_id: e.toNodeId,
        type: e.type,
        metadata: stringifyJson(e.metadata),
      })),
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

  override async saveReadTrace(trace: { traceId: string; containerIds: string[]; tags: string[]; createdAt: number }): Promise<void> {
    await this.clickHouse.client.insert({
      table: "toco_tracer.read_traces",
      values: [{
        trace_id: trace.traceId,
        container_ids: trace.containerIds,
        tags: trace.tags,
        created_at: trace.createdAt,
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
    const rows = await result.json<TraceMetadata>();
    return rows[0] || null;
  }

  override async fetchReadContainers(traceId: string): Promise<ReadContainer[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, parent_container_id as parentContainerId, name, type, tags, start_time_us as startTimeUs, duration_us as durationUs, metadata FROM toco_tracer.read_containers WHERE trace_id = {traceId: String} ORDER BY start_time_us ASC`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      parentContainerId: r.parentContainerId || null,
      startTimeUs: Number(r.startTimeUs),
      durationUs: r.durationUs !== null ? Number(r.durationUs) : null,
      metadata: r.metadata ? parseJson(r.metadata) : null,
    }));
  }

  override async fetchReadNodes(traceId: string): Promise<ReadNode[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, container_id as containerId, name, type, tags, parentage, local_sequence as localSequence, start_time_us as startTimeUs, duration_us as durationUs, metadata FROM toco_tracer.read_nodes WHERE trace_id = {traceId: String} ORDER BY container_id, local_sequence ASC`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      startTimeUs: Number(r.startTimeUs),
      durationUs: r.durationUs !== null ? Number(r.durationUs) : null,
      localSequence: Number(r.localSequence),
      metadata: r.metadata ? parseJson(r.metadata) : null,
    }));
  }

  override async fetchReadEdges(traceId: string): Promise<ReadEdge[]> {
    const result = await this.clickHouse.client.query({
      query: `SELECT id, trace_id as traceId, from_node_id as fromNodeId, to_node_id as toNodeId, type, metadata FROM toco_tracer.read_edges WHERE trace_id = {traceId: String}`,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    return rows.map((r: any) => ({
      ...r,
      metadata: r.metadata ? parseJson(r.metadata) : null,
    }));
  }

  override async fetchTracesList(page: number, limit: number): Promise<TraceListItem[]> {
    const offset = (page - 1) * limit;
    const result = await this.clickHouse.client.query({
      query: `
        SELECT
          trace_id AS traceId,
          container_ids AS containerIds,
          tags,
          created_at AS createdAt
        FROM toco_tracer.read_traces
        ORDER BY created_at DESC
        LIMIT {limit: UInt32} OFFSET {offset: UInt32}
      `,
      query_params: { limit, offset },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();
    
    const traceIds = rows.map((r: any) => r.traceId);
    if (!traceIds.length) return [];

    const namesResult = await this.clickHouse.client.query({
      query: `
        SELECT trace_id as traceId, groupArray(name) as containerNames
        FROM toco_tracer.read_containers
        WHERE trace_id IN (${traceIds.map((id: string) => `'${id}'`).join(",")})
        GROUP BY trace_id
      `,
      format: "JSONEachRow",
    });
    const namesRows = await namesResult.json<any>();
    const namesMap = new Map<string, string[]>();
    for (const nr of namesRows) {
      namesMap.set(nr.traceId, nr.containerNames);
    }

    return rows.map((r: any) => ({
      traceId: r.traceId,
      isZoomReady: true,
      createdAt: Number(r.createdAt),
      containerNames: namesMap.get(r.traceId) || [],
      tags: r.tags || [],
    }));
  }

  override async fetchTracesCount(): Promise<number> {
    const result = await this.clickHouse.client.query({
      query: `SELECT count(DISTINCT trace_id) AS total FROM toco_tracer.read_traces`,
      format: "JSONEachRow",
    });
    const rows = await result.json<{ total: number }>();
    return Number(rows[0]?.total ?? 0);
  }
}

function stringifyJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

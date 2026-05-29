import { Service } from "@carno.js/core";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import { LogRepo } from "../LogRepo";
import type { TraceBlock, TraceContainer, TraceEdge, TraceNode } from "../../types";

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
}

function stringifyJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

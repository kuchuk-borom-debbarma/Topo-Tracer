import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";
import { ClickHouseService } from "../../../../infra/ClickHouseService";
import type { Container, Node, Edge } from "../../types";

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
}




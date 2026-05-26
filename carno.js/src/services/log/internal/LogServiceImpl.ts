import { Service } from "@carno.js/core";
import { LogService } from "../LogService";
import { LogRepo } from "./LogRepo";
import type { Container, Node, Edge, ContainerInput, NodeInput, EdgeInput } from "../types";

@Service()
export class LogServiceImpl extends LogService {
  constructor(private logRepo: LogRepo) {
    super();
  }

  override async logContainer(container: ContainerInput): Promise<void> {
    await this.logContainers([container]);
  }

  override async logContainers(containers: ContainerInput[]): Promise<void> {
    console.log(`[LogService] Logging ${containers.length} containers`);
    
    // Enrich with server-side remote timestamp
    const enrichedContainers: Container[] = containers.map(c => ({
      ...c,
      createdAtRemote: new Date()
    }));

    await this.clickHouseLogRepoOverride(enrichedContainers);
  }

  override async logNode(node: NodeInput): Promise<void> {
    await this.logNodes([node]);
  }

  override async logNodes(nodes: NodeInput[]): Promise<void> {
    console.log(`[LogService] Logging ${nodes.length} nodes`);

    // Enrich optional fields to ensure compatibility
    const enrichedNodes: Node[] = nodes.map(n => ({
      ...n,
      parentNodeId: n.parentNodeId || "",
      metadata: n.metadata ?? null
    }));

    await this.logRepo.saveNodes(enrichedNodes);
  }

  override async logEdge(edge: EdgeInput): Promise<void> {
    await this.logEdges([edge]);
  }

  override async logEdges(edges: EdgeInput[]): Promise<void> {
    console.log(`[LogService] Logging ${edges.length} edges`);
    await this.logRepo.saveEdges(edges);
  }

  // Private helper to wrap and delegate
  private async clickHouseLogRepoOverride(containers: Container[]): Promise<void> {
    await this.logRepo.saveContainers(containers);
  }
}


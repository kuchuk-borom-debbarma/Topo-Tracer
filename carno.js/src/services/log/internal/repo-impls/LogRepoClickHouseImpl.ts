import { Service } from "@carno.js/core";
import { LogRepo } from "../LogRepo";
import type { Container, Node, Edge } from "../../types";

@Service()
export class LogRepoClickHouseImpl extends LogRepo {
  override async saveContainer(container: Container): Promise<void> {
    console.log(
      `[ClickHouse] Saving container: ${container.name} (${container.id})`,
    );
  }

  override async saveContainers(containers: Container[]): Promise<void> {
    console.log(
      `[ClickHouse] Saving batch of ${containers.length} containers`,
    );
  }

  override async saveNode(node: Node): Promise<void> {
    console.log(`[ClickHouse] Saving node: ${node.name} (${node.id})`);
  }

  override async saveNodes(nodes: Node[]): Promise<void> {
    console.log(`[ClickHouse] Saving batch of ${nodes.length} nodes`);
  }

  override async saveEdge(edge: Edge): Promise<void> {
    console.log(`[ClickHouse] Saving edge: ${edge.edgeType} (${edge.id})`);
  }

  override async saveEdges(edges: Edge[]): Promise<void> {
    console.log(`[ClickHouse] Saving batch of ${edges.length} edges`);
  }
}



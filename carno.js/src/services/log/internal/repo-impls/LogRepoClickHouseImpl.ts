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

  override async saveNode(node: Node): Promise<void> {
    console.log(`[ClickHouse] Saving node: ${node.name} (${node.id})`);
  }

  override async saveEdge(edge: Edge): Promise<void> {
    console.log(`[ClickHouse] Saving edge: ${edge.edgeType} (${edge.id})`);
  }
}



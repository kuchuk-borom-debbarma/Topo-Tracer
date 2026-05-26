import { Service } from "@carno.js/core";
import { LogService } from "../LogService";
import { LogRepo } from "./LogRepo";
import type { Container, Node, Edge } from "../types";

@Service()
export class LogServiceImpl extends LogService {
  constructor(private logRepo: LogRepo) {
    super();
  }

  override async logContainer(container: Container): Promise<void> {
    console.log(`[LogService] Logging container: ${container.name}`);
    await this.logRepo.saveContainer(container);
  }

  override async logNode(node: Node): Promise<void> {
    console.log(`[LogService] Logging node: ${node.name}`);
    await this.logRepo.saveNode(node);
  }

  override async logEdge(edge: Edge): Promise<void> {
    console.log(`[LogService] Logging edge: ${edge.id}`);
    await this.logRepo.saveEdge(edge);
  }
}

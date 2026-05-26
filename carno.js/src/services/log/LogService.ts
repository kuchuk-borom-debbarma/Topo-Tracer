import type { Container, Node, Edge } from "./types";

export class LogService {
  async logContainer(container: Container): Promise<void> {}
  async logNode(node: Node): Promise<void> {}
  async logEdge(edge: Edge): Promise<void> {}
}

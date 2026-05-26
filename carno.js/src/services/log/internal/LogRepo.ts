import type { Container, Node, Edge } from "../types";

export class LogRepo {
  async saveContainer(container: Container): Promise<void> {}
  async saveNode(node: Node): Promise<void> {}
  async saveEdge(edge: Edge): Promise<void> {}
}

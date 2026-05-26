import type { Container, Node, Edge } from "../types";

export class LogRepo {
  async saveContainer(container: Container): Promise<void> {}
  async saveContainers(containers: Container[]): Promise<void> {}

  async saveNode(node: Node): Promise<void> {}
  async saveNodes(nodes: Node[]): Promise<void> {}

  async saveEdge(edge: Edge): Promise<void> {}
  async saveEdges(edges: Edge[]): Promise<void> {}
}

import type { ContainerInput, NodeInput, EdgeInput } from "./types";

export class LogService {
  async logContainer(container: ContainerInput): Promise<void> {}
  async logContainers(containers: ContainerInput[]): Promise<void> {}

  async logNode(node: NodeInput): Promise<void> {}
  async logNodes(nodes: NodeInput[]): Promise<void> {}

  async logEdge(edge: EdgeInput): Promise<void> {}
  async logEdges(edges: EdgeInput[]): Promise<void> {}

  async updateContainerLocalTimes(containers: ContainerInput[], newTime?: Date): Promise<ContainerInput[]> {
    return [];
  }

  async updateNodeLocalTimes(nodes: NodeInput[], newTime?: Date): Promise<NodeInput[]> {
    return [];
  }

  async updateEdgeLocalTimes(edges: EdgeInput[], newTime?: Date): Promise<EdgeInput[]> {
    return [];
  }
}



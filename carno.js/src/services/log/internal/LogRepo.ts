import type { TraceBlock, TraceContainer, TraceEdge, TraceNode } from "../types";

export class LogRepo {
  async saveContainers(containers: TraceContainer[]): Promise<void> {}
  async saveBlocks(blocks: TraceBlock[]): Promise<void> {}
  async saveNodes(nodes: TraceNode[]): Promise<void> {}
  async saveEdges(edges: TraceEdge[]): Promise<void> {}
}

import { Service } from "@carno.js/core";
import { LogService } from "../LogService";
import type {
  TraceBlock,
  TraceBlockInput,
  TraceContainer,
  TraceContainerInput,
  TraceEdge,
  TraceEdgeInput,
  TraceNode,
  TraceNodeInput,
} from "../types";
import { LogRepo } from "./LogRepo";

@Service()
export class LogServiceImpl extends LogService {
  constructor(private logRepo: LogRepo) {
    super();
  }

  override async logContainers(containers: TraceContainerInput[]): Promise<void> {
    const createdAtRemote = new Date();
    const enriched: TraceContainer[] = containers.map(container => ({
      ...container,
      metadata: container.metadata ?? null,
      createdAtRemote,
    }));

    await this.logRepo.saveContainers(enriched);
  }

  override async logBlocks(blocks: TraceBlockInput[]): Promise<void> {
    const enriched: TraceBlock[] = blocks.map(block => ({
      ...block,
      metadata: block.metadata ?? null,
    }));

    await this.logRepo.saveBlocks(enriched);
  }

  override async logNodes(nodes: TraceNodeInput[]): Promise<void> {
    const enriched: TraceNode[] = nodes.map(node => ({
      ...node,
      metadata: node.metadata ?? null,
    }));

    await this.logRepo.saveNodes(enriched);
  }

  override async logEdges(edges: TraceEdgeInput[]): Promise<void> {
    const enriched: TraceEdge[] = edges.map(edge => ({
      ...edge,
      metadata: edge.metadata ?? null,
    }));

    await this.logRepo.saveEdges(enriched);
  }
}

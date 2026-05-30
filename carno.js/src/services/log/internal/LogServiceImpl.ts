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
import { TraceMaterializationWorker } from "./worker/TraceMaterializationWorker";

@Service()
export class LogServiceImpl extends LogService {
  constructor(
    private logRepo: LogRepo,
    private worker: TraceMaterializationWorker
  ) {
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
    this.triggerTraces(containers);
  }

  override async logBlocks(blocks: TraceBlockInput[]): Promise<void> {
    const enriched: TraceBlock[] = blocks.map(block => ({
      ...block,
      metadata: block.metadata ?? null,
    }));

    await this.logRepo.saveBlocks(enriched);
    this.triggerTraces(blocks);
  }

  override async logNodes(nodes: TraceNodeInput[]): Promise<void> {
    const ingestedAtRemote = new Date();
    const enriched: TraceNode[] = nodes.map(node => ({
      ...node,
      metadata: node.metadata ?? null,
      ingestedAtRemote,
    }));

    await this.logRepo.saveNodes(enriched);
    this.triggerTraces(nodes);
  }

  override async logEdges(edges: TraceEdgeInput[]): Promise<void> {
    const ingestedAtRemote = new Date();
    const enriched: TraceEdge[] = edges.map(edge => ({
      ...edge,
      metadata: edge.metadata ?? null,
      ingestedAtRemote,
    }));

    await this.logRepo.saveEdges(enriched);
    this.triggerTraces(edges);
  }

  private triggerTraces(items: { traceId: string }[]): void {
    if (!this.worker) return;
    const uniqueIds = Array.from(new Set(items.map(item => item.traceId)));
    for (const traceId of uniqueIds) {
      this.worker.triggerMaterialization(traceId);
    }
  }
}



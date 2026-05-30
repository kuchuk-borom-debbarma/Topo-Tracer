import { Service } from "@carno.js/core";
import { LogService, type TraceListResponse } from "../LogService";
import type {
  TraceContainer,
  TraceContainerInput,
  TraceEdge,
  TraceEdgeInput,
  TraceNode,
  TraceNodeInput,
  TraceLayoutResponse,
} from "../types";
import { LogRepo } from "./LogRepo";
import { TraceMaterializationWorker } from "./worker/TraceMaterializationWorker";

@Service()
export class LogServiceImpl extends LogService {
  constructor(
    private logRepo: LogRepo,
    private worker?: TraceMaterializationWorker
  ) {
    super();
  }

  override async logContainers(containers: TraceContainerInput[]): Promise<void> {
    const enriched: TraceContainer[] = containers.map(container => ({
      ...container,
      timestamp: new Date(container.timestamp),
      createdAtRemote: new Date(),
    }));

    await this.logRepo.saveContainers(enriched);
    this.triggerTraces(containers);
  }

  override async logNodes(nodes: TraceNodeInput[]): Promise<void> {
    const enriched: TraceNode[] = nodes.map(node => ({
      ...node,
      timestamp: new Date(node.timestamp),
      metadata: node.metadata ?? null,
      ingestedAtRemote: new Date(),
    }));

    await this.logRepo.saveNodes(enriched);
    this.triggerTraces(nodes);
  }

  override async logEdges(edges: TraceEdgeInput[]): Promise<void> {
    const enriched: TraceEdge[] = edges.map(edge => ({
      ...edge,
      timestamp: new Date(edge.timestamp),
    }));

    await this.logRepo.saveEdges(enriched);
    this.triggerTraces(edges);
  }

  override async getTraceLayout(traceId: string): Promise<TraceLayoutResponse | null> {
    // 1. Fetch trace metadata
    const metadata = await this.logRepo.fetchTraceMetadata(traceId);

    // 2. Fetch read-optimized containers, nodes, and edges
    const [containers, nodes, edges] = await Promise.all([
      this.logRepo.fetchReadContainers(traceId),
      this.logRepo.fetchReadNodes(traceId),
      this.logRepo.fetchReadEdges(traceId),
    ]);

    // 3. Extract unique tags present in this trace for UI autocomplete
    const tagsSet = new Set<string>();
    for (const c of containers) {
      if (c.tags) c.tags.forEach(t => tagsSet.add(t));
    }
    for (const n of nodes) {
      if (n.tags) n.tags.forEach(t => tagsSet.add(t));
    }

    return {
      metadata: {
        traceId,
        isZoomReady: metadata ? !!metadata.isZoomReady : false,
        tags: Array.from(tagsSet),
      },
      containers,
      nodes,
      edges,
    };
  }

  private triggerTraces(items: { traceId: string }[]): void {
    if (!this.worker) return;
    const uniqueIds = Array.from(new Set(items.map(item => item.traceId)));
    for (const traceId of uniqueIds) {
      this.worker.triggerMaterialization(traceId);
    }
  }

  override async listTraces(page: number, limit: number): Promise<TraceListResponse> {
    const [traces, total] = await Promise.all([
      this.logRepo.fetchTracesList(page, limit),
      this.logRepo.fetchTracesCount(),
    ]);
    return {
      traces,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

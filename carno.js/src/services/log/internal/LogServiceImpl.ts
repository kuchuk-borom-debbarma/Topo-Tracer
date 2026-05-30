import { Service } from "@carno.js/core";
import { LogService, type TraceListResponse } from "../LogService";
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
      createdAtLocal: typeof container.createdAtLocal === "string" ? new Date(container.createdAtLocal) : container.createdAtLocal,
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
      eventAtLocal: typeof node.eventAtLocal === "string" ? new Date(node.eventAtLocal) : node.eventAtLocal,
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
      eventAtLocal: typeof edge.eventAtLocal === "string" ? new Date(edge.eventAtLocal) : edge.eventAtLocal,
      metadata: edge.metadata ?? null,
      ingestedAtRemote,
    }));

    await this.logRepo.saveEdges(enriched);
    this.triggerTraces(edges);
  }

  override async getTraceLayout(traceId: string, zoomLevel?: number): Promise<any> {
    // 1. Fetch trace metadata
    const metadata = await this.logRepo.fetchTraceMetadata(traceId);

    // Default to max structural call depth if no query parameter is provided
    const activeLevel = zoomLevel !== undefined ? zoomLevel : (metadata?.maxAvailableDepth ?? 2);

    // 2. Fetch blocks, visible nodes, and horizontal wires dynamically
    const [blocks, nodes, edges] = await Promise.all([
      this.logRepo.fetchReadBlocks(traceId),
      this.logRepo.fetchReadNodes(traceId, activeLevel),
      this.logRepo.fetchReadEdges(traceId),
    ]);

    return {
      metadata: {
        traceId,
        isZoomReady: metadata ? !!metadata.isZoomReady : false,
        maxAvailableDepth: metadata ? metadata.maxAvailableDepth : 2,
        currentDepth: activeLevel,
      },
      blocks,
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
      traces: traces.map(t => ({
        ...t,
        isZoomReady: Boolean(t.isZoomReady),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

import { Service } from "@carno.js/core";
import { LogService } from "../LogService";
import type {
  TraceContainer,
  TraceContainerInput,
  TraceEdge,
  TraceEdgeInput,
  TraceNode,
  TraceNodeInput,
  TraceLayoutResponse,
  TraceListResponse,
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

  override async getTraceLayout(traceId: string, tags?: string[]): Promise<TraceLayoutResponse | null> {
    // 1. Fetch trace metadata
    const metadata = await this.logRepo.fetchTraceMetadata(traceId);

    // 2. Fetch read-optimized containers, nodes, and edges
    const [containers, nodes, edges] = await Promise.all([
      this.logRepo.fetchReadContainers(traceId),
      this.logRepo.fetchReadNodes(traceId),
      this.logRepo.fetchReadEdges(traceId),
    ]);

    // 3. Extract unique tags present in this trace for UI autocomplete (from unfiltered list!)
    const tagsSet = new Set<string>();
    for (const c of containers) {
      if (c.tags) c.tags.forEach(t => tagsSet.add(t));
    }
    for (const n of nodes) {
      if (n.tags) n.tags.forEach(t => tagsSet.add(t));
    }

    // 4. Perform dynamic AND-logic filtering and ancestry snapping on the backend
    let finalContainers = containers;
    let finalNodes = nodes;
    let finalEdges = edges;

    if (tags && tags.length > 0) {
      const activeTags = new Set(tags);

      const isNodeVisible = (n: typeof nodes[0]): boolean => {
        return tags.every((tag) => n.tags && n.tags.includes(tag));
      };

      const containerVisCache = new Map<string, boolean>();
      const isContainerVisible = (cid: string): boolean => {
        if (containerVisCache.has(cid)) return containerVisCache.get(cid)!;

        const hasContent =
          nodes.some((n) => n.containerId === cid) ||
          containers.some((c) => c.parentContainerId === cid && c.id !== cid);

        if (!hasContent) {
          containerVisCache.set(cid, false);
          return false;
        }

        const tagMatched = tags.every((tag) => {
          const c = containers.find((x) => x.id === cid);
          return !!(c && c.tags && c.tags.includes(tag));
        });

        if (tagMatched) {
          containerVisCache.set(cid, true);
          return true;
        }

        if (nodes.some((n) => n.containerId === cid && isNodeVisible(n))) {
          containerVisCache.set(cid, true);
          return true;
        }

        if (
          containers.some(
            (c) => c.parentContainerId === cid && c.id !== cid && isContainerVisible(c.id)
          )
        ) {
          containerVisCache.set(cid, true);
          return true;
        }

        containerVisCache.set(cid, false);
        return false;
      };

      finalContainers = containers.filter((c) => isContainerVisible(c.id));
      finalNodes = nodes.filter((n) => isNodeVisible(n) && isContainerVisible(n.containerId));

      const visibleContainerIds = new Set(finalContainers.map((c) => c.id));
      const visibleNodeIds = new Set(finalNodes.map((n) => n.id));

      const resolveAnchorId = (nodeId: string): string | null => {
        if (visibleNodeIds.has(nodeId) || visibleContainerIds.has(nodeId)) {
          return nodeId;
        }
        const asNode = nodes.find((n) => n.id === nodeId);
        if (asNode) {
          const parentage = asNode.parentage || [];
          for (const ancestorId of [...parentage].reverse()) {
            if (visibleNodeIds.has(ancestorId) || visibleContainerIds.has(ancestorId)) {
              return ancestorId;
            }
          }
        }
        const asContainer = containers.find((c) => c.id === nodeId);
        if (asContainer) {
          let pid = asContainer.parentContainerId;
          while (pid) {
            if (visibleContainerIds.has(pid)) {
              return pid;
            }
            const p = containers.find((c) => c.id === pid);
            pid = p ? p.parentContainerId : null;
          }
        }
        return null;
      };

      const snappedEdges: typeof edges = [];
      const seenConnections = new Set<string>();

      for (const edge of edges) {
        const fromId = resolveAnchorId(edge.fromNodeId);
        const toId = resolveAnchorId(edge.toContainerId);
        if (fromId && toId && fromId !== toId) {
          const isSnapped = fromId !== edge.fromNodeId || toId !== edge.toContainerId;
          const connKey = `${fromId}->${toId}`;

          let distance = 0;
          if (isSnapped) {
            distance = Math.max(1, edge.distance);
          }

          if (!seenConnections.has(connKey)) {
            seenConnections.add(connKey);
            snappedEdges.push({
              ...edge,
              fromNodeId: fromId,
              toContainerId: toId,
              distance,
            });
          }
        }
      }
      finalEdges = snappedEdges;
    } else {
      // Unfiltered view: all raw edges represent direct transitions (distance = 0)
      finalEdges = edges.map(edge => ({
        ...edge,
        distance: 0,
      }));
    }

    return {
      metadata: {
        traceId,
        isZoomReady: metadata ? !!metadata.isZoomReady : false,
        tags: Array.from(tagsSet),
      },
      containers: finalContainers.map(({ parentage, ...c }) => c),
      nodes: finalNodes.map(({ parentage, ...n }) => n),
      edges: finalEdges,
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

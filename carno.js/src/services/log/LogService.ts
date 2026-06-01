import { Service } from "@carno.js/core";
import { RawEventRepository } from "./RawEventRepository";
import { ReadModelRepository } from "./ReadModelRepository";
import type {
  FlowWindowQuery,
  FlowWindowResponse,
  ReadContainer,
  ReadEdge,
  ReadNode,
  TraceEventInput,
  TraceListResponse,
  TraceSummary,
} from "./types";

const DEFAULT_DETAIL_BUDGET = 250;
const MAX_DETAIL_BUDGET = 500;

@Service()
export class LogService {
  constructor(
    private rawEvents: RawEventRepository,
    private readModels: ReadModelRepository,
  ) {}

  async ingestEvents(events: TraceEventInput[]): Promise<{ ok: true; count: number }> {
    validateEvents(events);
    const count = await this.rawEvents.append(events);
    return { ok: true, count };
  }

  listTraces(page: number, limit: number): Promise<TraceListResponse> {
    return this.readModels.listTraces(page, limit);
  }

  getTraceSummary(traceId: string): Promise<TraceSummary | null> {
    return this.readModels.getSummary(traceId);
  }

  async getFlowWindow(traceId: string, query: FlowWindowQuery): Promise<FlowWindowResponse | null> {
    const [summary, containers, allNodes, allEdges] = await Promise.all([
      this.readModels.getSummary(traceId),
      this.readModels.getContainers(traceId),
      this.readModels.getNodes(traceId),
      this.readModels.getEdges(traceId),
    ]);

    if (!summary) return null;

    const detailBudget = clampBudget(query.detailBudget);
    const anchorOrder = resolveAnchorOrder(query, allNodes);
    const before = Math.max(0, query.before ?? Math.floor(detailBudget / 2));
    const after = Math.max(0, query.after ?? detailBudget - before);
    const start = Math.max(0, anchorOrder - before);
    const endExclusive = Math.min(allNodes.length, anchorOrder + after + 1);

    const expandedIds = new Set(query.expandedIds ?? []);
    const hiddenIds = new Set(query.hiddenIds ?? []);
    const visibleNodes = selectVisibleNodes(allNodes, start, endExclusive, expandedIds, hiddenIds, detailBudget);
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleContainerIds = new Set<string>();

    for (const node of visibleNodes) {
      if (node.containerId) {
        visibleContainerIds.add(node.containerId);
        addContainerAncestors(node.containerId, containers, visibleContainerIds);
      }
    }

    const visibleContainers = containers.filter((container) => visibleContainerIds.has(container.id));
    const visibleEdges = allEdges.filter(
      (edge) => visibleNodeIds.has(edge.fromId) && visibleNodeIds.has(edge.toId)
    );

    const omittedNodeCount = Math.max(0, summary.nodeCount - visibleNodes.length);
    const omittedEdgeCount = Math.max(0, summary.edgeCount - visibleEdges.length);

    return {
      metadata: {
        traceId,
        anchorId: query.anchorId ?? null,
        detailBudget,
        returnedNodeCount: visibleNodes.length,
        totalNodeCount: summary.nodeCount,
        omittedNodeCount,
        omittedEdgeCount,
        hasMoreBefore: start > 0,
        hasMoreAfter: endExclusive < allNodes.length,
        previousCursor: start > 0 ? encodeCursor(Math.max(0, start - 1)) : null,
        nextCursor: endExclusive < allNodes.length ? encodeCursor(endExclusive) : null,
      },
      summary,
      containers: visibleContainers,
      nodes: visibleNodes,
      edges: visibleEdges,
    };
  }
}

function validateEvents(events: TraceEventInput[]): void {
  if (!Array.isArray(events)) throw new Error("Request body must be an array of trace events");
  for (const event of events) {
    if (!event.traceId || !event.entityId || !event.entityType || !event.eventType) {
      throw new Error("Trace event missing traceId/entityId/entityType/eventType");
    }
    if (!Number.isFinite(event.occurredAtUnixMs)) {
      throw new Error("Trace event missing valid occurredAtUnixMs");
    }
  }
}

function clampBudget(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_DETAIL_BUDGET;
  return Math.min(MAX_DETAIL_BUDGET, Math.max(1, Math.floor(value)));
}

function resolveAnchorOrder(query: FlowWindowQuery, nodes: ReadNode[]): number {
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (cursor !== null) return Math.min(nodes.length - 1, Math.max(0, cursor));
  }
  if (query.anchorId) {
    const anchor = nodes.find((node) => node.id === query.anchorId);
    if (anchor) return anchor.flowOrder;
  }
  return 0;
}

function selectVisibleNodes(
  nodes: ReadNode[],
  start: number,
  endExclusive: number,
  expandedIds: Set<string>,
  hiddenIds: Set<string>,
  detailBudget: number,
): ReadNode[] {
  const base = nodes.slice(start, endExclusive).filter((node) => !hiddenIds.has(node.id));
  const visible = new Map(base.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (visible.size >= detailBudget) break;
    if (!hiddenIds.has(node.id) && node.parentId && expandedIds.has(node.parentId)) {
      visible.set(node.id, node);
    }
  }

  return Array.from(visible.values())
    .sort((a, b) => a.flowOrder - b.flowOrder)
    .slice(0, detailBudget);
}

function addContainerAncestors(
  containerId: string,
  containers: ReadContainer[],
  visibleContainerIds: Set<string>,
): void {
  const byId = new Map(containers.map((container) => [container.id, container]));
  const container = byId.get(containerId);
  for (const ancestorId of container?.ancestryIds ?? []) {
    visibleContainerIds.add(ancestorId);
  }
}

function encodeCursor(flowOrder: number): string {
  return Buffer.from(String(flowOrder), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number | null {
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

import { Service } from "@carno.js/core";
import { RawEventRepository } from "./RawEventRepository";
import { ReadModelRepository } from "./ReadModelRepository";
import type {
  GhostNode,
  GraphEdge,
  GraphWindowQuery,
  GraphWindowResponse,
  ReadEdge,
  ReadNode,
  TraceEventInput,
  TraceListResponse,
  TraceSummary,
} from "./types";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;

@Service()
export class LogService {
  constructor(
    private rawEvents: RawEventRepository,
    private readModels: ReadModelRepository,
  ) {}

  async ingestEvents(events: TraceEventInput[]): Promise<{ ok: true; count: number }> {
    validateEvents(events);
    return { ok: true, count: await this.rawEvents.append(events) };
  }

  listTraces(page: number, limit: number): Promise<TraceListResponse> {
    return this.readModels.listTraces(page, limit);
  }

  getTraceSummary(traceId: string): Promise<TraceSummary | null> {
    return this.readModels.getSummary(traceId);
  }

  async getGraph(traceId: string, query: GraphWindowQuery): Promise<GraphWindowResponse | null> {
    const [summary, allNodes, allEdges] = await Promise.all([
      this.readModels.getSummary(traceId),
      this.readModels.getNodes(traceId),
      this.readModels.getEdges(traceId),
    ]);
    if (!summary) return null;

    const maxDepth = clampDepth(query.maxDepth, summary.maxDepth);
    const limit = clampLimit(query.limit);
    const offset = decodeCursor(query.cursor) ?? 0;
    const projected = projectDepth(allNodes, allEdges, maxDepth);
    const windowedNodes = projected.nodes.slice(offset, offset + limit);
    const nodeIds = new Set(windowedNodes.map((node) => node.id));
    const windowedEdges = projected.edges.filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId));

    return {
      metadata: {
        traceId,
        maxDepth,
        limit,
        returnedNodeCount: windowedNodes.length,
        totalNodeCount: summary.nodeCount,
        hiddenNodeCount: projected.hiddenNodeCount,
        ghostNodeCount: projected.ghostNodeCount,
        hasBefore: offset > 0,
        hasAfter: offset + limit < projected.nodes.length,
        previousCursor: offset > 0 ? encodeCursor(Math.max(0, offset - limit)) : null,
        nextCursor: offset + limit < projected.nodes.length ? encodeCursor(offset + limit) : null,
      },
      summary,
      nodes: windowedNodes,
      edges: windowedEdges,
    };
  }
}

function validateEvents(events: TraceEventInput[]): void {
  if (!Array.isArray(events)) throw new Error("Request body must be an array");
  for (const event of events) {
    if (!event.traceId || !event.entityId || !event.entityType || !event.eventType) {
      throw new Error("Event missing traceId/entityId/entityType/eventType");
    }
    if (!Number.isFinite(event.occurredAtUnixMs)) throw new Error("Event missing valid occurredAtUnixMs");
    if (event.entityType === "node" && event.eventType !== "node.started" && event.eventType !== "node.ended") {
      throw new Error("Node entity requires node.* event type");
    }
    if (event.entityType === "edge" && event.eventType !== "edge.started" && event.eventType !== "edge.ended") {
      throw new Error("Edge entity requires edge.* event type");
    }
  }
}

function projectDepth(nodes: ReadNode[], edges: ReadEdge[], maxDepth: number): {
  nodes: Array<ReadNode | GhostNode>;
  edges: GraphEdge[];
  hiddenNodeCount: number;
  ghostNodeCount: number;
} {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visible = nodes.filter((node) => node.depth <= maxDepth);
  const visibleIds = new Set(visible.map((node) => node.id));
  const hidden = nodes.filter((node) => !visibleIds.has(node.id));
  const ghosts = buildGhosts(hidden, byId, visibleIds, maxDepth);
  const ghostByAncestor = new Map(ghosts.map((ghost) => [ghost.parentId ?? "", ghost]));
  const outputNodes = [...visible, ...ghosts].sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id));
  const outputNodeIds = new Set(outputNodes.map((node) => node.id));
  const outputEdges = liftEdges(edges, byId, visibleIds, ghostByAncestor, outputNodeIds);

  return {
    nodes: outputNodes,
    edges: outputEdges,
    hiddenNodeCount: hidden.length,
    ghostNodeCount: ghosts.length,
  };
}

function buildGhosts(
  hidden: ReadNode[],
  byId: Map<string, ReadNode>,
  visibleIds: Set<string>,
  maxDepth: number,
): GhostNode[] {
  const groups = new Map<string, ReadNode[]>();

  for (const node of hidden) {
    const visibleAncestorId = findVisibleAncestor(node, byId, visibleIds);
    const groupKey = visibleAncestorId ?? "__root__";
    const existing = groups.get(groupKey) ?? [];
    existing.push(node);
    groups.set(groupKey, existing);
  }

  return Array.from(groups.entries()).map(([ancestorId, group]) => {
    const parent = ancestorId === "__root__" ? null : byId.get(ancestorId) ?? null;
    const startTimes = group.map((node) => node.startedAtUnixMs).filter((value): value is number => value !== null);
    const endTimes = group.map((node) => node.endedAtUnixMs).filter((value): value is number => value !== null);
    const first = group.slice().sort((a, b) => a.flowOrder - b.flowOrder)[0]!;
    return {
      id: `ghost:${ancestorId}`,
      traceId: first.traceId,
      parentId: parent?.id ?? null,
      name: `${group.length} hidden deeper node${group.length === 1 ? "" : "s"}`,
      depth: Math.max(0, maxDepth + 1),
      status: group.some((node) => node.status === "error") ? "error" : "ok",
      startedAtUnixMs: startTimes.length ? Math.min(...startTimes) : null,
      endedAtUnixMs: endTimes.length ? Math.max(...endTimes) : null,
      durationMs: startTimes.length && endTimes.length ? Math.max(...endTimes) - Math.min(...startTimes) : null,
      ancestryPath: parent ? [...parent.ancestryPath, parent.id] : [],
      flowOrder: first.flowOrder + 0.1,
      diagnostics: [],
      data: {
        summary: "Collapsed by depth slider",
        hiddenNodeIds: group.slice(0, 25).map((node) => node.id),
        truncatedHiddenNodeIds: Math.max(0, group.length - 25),
      },
      isGhost: true,
      hiddenNodeCount: group.length,
      hiddenErrorCount: group.filter((node) => node.status === "error").length,
    };
  });
}

function liftEdges(
  edges: ReadEdge[],
  byId: Map<string, ReadNode>,
  visibleIds: Set<string>,
  ghostByAncestor: Map<string, GhostNode>,
  outputNodeIds: Set<string>,
): GraphEdge[] {
  const grouped = new Map<string, GraphEdge>();

  for (const edge of edges) {
    const from = resolveEndpoint(edge.fromNodeId, byId, visibleIds, ghostByAncestor);
    const to = resolveEndpoint(edge.toNodeId, byId, visibleIds, ghostByAncestor);
    if (!from || !to || from === to || !outputNodeIds.has(from) || !outputNodeIds.has(to)) continue;

    const key = `${from}->${to}:${edge.label}`;
    const existing = grouped.get(key);
    const isGhost = from !== edge.fromNodeId || to !== edge.toNodeId;
    if (existing) {
      existing.hiddenEdgeCount = (existing.hiddenEdgeCount ?? 1) + 1;
      existing.isGhost = existing.isGhost || isGhost;
      continue;
    }
    grouped.set(key, {
      ...edge,
      id: isGhost ? `ghost-edge:${key}` : edge.id,
      fromNodeId: from,
      toNodeId: to,
      isGhost: isGhost || undefined,
      hiddenEdgeCount: isGhost ? 1 : undefined,
    });
  }

  return Array.from(grouped.values());
}

function resolveEndpoint(
  nodeId: string,
  byId: Map<string, ReadNode>,
  visibleIds: Set<string>,
  ghostByAncestor: Map<string, GhostNode>,
): string | null {
  if (visibleIds.has(nodeId)) return nodeId;
  const node = byId.get(nodeId);
  if (!node) return null;
  const ancestorId = findVisibleAncestor(node, byId, visibleIds);
  if (!ancestorId) return ghostByAncestor.get("__root__")?.id ?? null;
  return ghostByAncestor.get(ancestorId)?.id ?? ancestorId;
}

function findVisibleAncestor(node: ReadNode, byId: Map<string, ReadNode>, visibleIds: Set<string>): string | null {
  for (let index = node.ancestryPath.length - 1; index >= 0; index--) {
    const ancestorId = node.ancestryPath[index];
    if (ancestorId && visibleIds.has(ancestorId)) return ancestorId;
  }
  let parentId = node.parentId;
  while (parentId) {
    if (visibleIds.has(parentId)) return parentId;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return null;
}

function clampDepth(value: number | undefined, maxDepth: number): number {
  if (!Number.isFinite(value)) return Math.min(2, maxDepth);
  return Math.max(0, Math.min(maxDepth, Math.floor(value!)));
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value!)));
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number | null {
  if (!cursor) return null;
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  } catch {
    return null;
  }
}

import { Service } from "@carno.js/core";
import type {
  DiagnosticCode,
  JsonObject,
  ReadContainer,
  ReadEdge,
  ReadNode,
  TraceEventRecord,
  TraceSummary,
} from "./types";

type EntityDraft = {
  id: string;
  traceId: string;
  parentId: string | null;
  containerId: string | null;
  fromId: string | null;
  toId: string | null;
  name: string;
  kind: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  metadata: JsonObject;
  diagnostics: Set<DiagnosticCode>;
};

@Service()
export class TraceReadModelBuilder {
  build(traceId: string, events: TraceEventRecord[]): {
    containers: ReadContainer[];
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: TraceSummary;
  } | null {
    if (!events.length) return null;

    const containers = new Map<string, EntityDraft>();
    const nodes = new Map<string, EntityDraft>();
    const edges = new Map<string, EntityDraft>();

    for (const event of events) {
      if (event.entityType === "container") {
        applyLifecycle(containers, event);
      } else if (event.entityType === "node") {
        applyLifecycle(nodes, event);
      } else if (event.entityType === "edge") {
        applyLifecycle(edges, event);
      }
    }

    const containerAncestry = computeAncestry(containers, null);
    const nodeAncestry = computeAncestry(nodes, "orphanNode");
    const flowOrder = computeFlowOrder(nodes, edges);

    const readContainers = Array.from(containers.values()).map<ReadContainer>((draft) => {
      finalizeLifecycle(draft);
      return {
        id: draft.id,
        traceId: draft.traceId,
        parentId: draft.parentId,
        name: draft.name,
        kind: draft.kind,
        status: draft.status,
        startedAtUnixMs: draft.startedAtUnixMs,
        endedAtUnixMs: draft.endedAtUnixMs,
        durationMs: durationOf(draft),
        ancestryIds: containerAncestry.get(draft.id)?.ancestry ?? [],
        diagnostics: Array.from(draft.diagnostics),
        metadata: draft.metadata,
      };
    });

    const readNodes = Array.from(nodes.values()).map<ReadNode>((draft) => {
      finalizeLifecycle(draft);
      if (draft.containerId && !containers.has(draft.containerId)) {
        draft.diagnostics.add("orphanNode");
      }
      return {
        id: draft.id,
        traceId: draft.traceId,
        containerId: draft.containerId,
        parentId: draft.parentId,
        name: draft.name,
        kind: draft.kind,
        status: draft.status,
        startedAtUnixMs: draft.startedAtUnixMs,
        endedAtUnixMs: draft.endedAtUnixMs,
        durationMs: durationOf(draft),
        ancestryIds: nodeAncestry.get(draft.id)?.ancestry ?? [],
        flowOrder: flowOrder.get(draft.id) ?? Number.MAX_SAFE_INTEGER,
        diagnostics: Array.from(draft.diagnostics),
        metadata: draft.metadata,
      };
    }).sort((a, b) => a.flowOrder - b.flowOrder || (a.startedAtUnixMs ?? 0) - (b.startedAtUnixMs ?? 0));

    const readEdges = Array.from(edges.values()).map<ReadEdge>((draft) => {
      finalizeLifecycle(draft);
      if (!draft.fromId || !draft.toId || !nodes.has(draft.fromId) || !nodes.has(draft.toId)) {
        draft.diagnostics.add("orphanEdge");
      }
      const from = draft.fromId ? nodes.get(draft.fromId) : null;
      const to = draft.toId ? nodes.get(draft.toId) : null;
      if (from?.startedAtUnixMs && to?.startedAtUnixMs && from.startedAtUnixMs > to.startedAtUnixMs) {
        draft.diagnostics.add("clockSkewSuspected");
      }

      return {
        id: draft.id,
        traceId: draft.traceId,
        fromId: draft.fromId ?? "",
        toId: draft.toId ?? "",
        kind: draft.kind,
        status: draft.status,
        startedAtUnixMs: draft.startedAtUnixMs,
        endedAtUnixMs: draft.endedAtUnixMs,
        durationMs: durationOf(draft),
        diagnostics: Array.from(draft.diagnostics),
        metadata: draft.metadata,
      };
    });

    const allDiagnostics = [
      ...readContainers.flatMap((item) => item.diagnostics),
      ...readNodes.flatMap((item) => item.diagnostics),
      ...readEdges.flatMap((item) => item.diagnostics),
    ];

    const times = events.map((event) => event.occurredAtUnixMs);
    const summary: TraceSummary = {
      traceId,
      createdAtUnixMs: Math.min(...times),
      updatedAtUnixMs: Math.max(...times),
      containerCount: readContainers.length,
      nodeCount: readNodes.length,
      edgeCount: readEdges.length,
      errorCount: countErrors(readContainers, readNodes, readEdges),
      diagnosticCount: allDiagnostics.length,
      materializedAtUnixMs: Date.now(),
    };

    return {
      containers: readContainers,
      nodes: readNodes,
      edges: readEdges,
      summary,
    };
  }
}

function applyLifecycle(map: Map<string, EntityDraft>, event: TraceEventRecord): void {
  const draft = map.get(event.entityId) ?? {
    id: event.entityId,
    traceId: event.traceId,
    parentId: null,
    containerId: null,
    fromId: null,
    toId: null,
    name: event.entityId,
    kind: event.entityType,
    status: "open",
    startedAtUnixMs: null,
    endedAtUnixMs: null,
    metadata: {},
    diagnostics: new Set<DiagnosticCode>(),
  };

  draft.parentId = event.parentId ?? draft.parentId;
  draft.containerId = event.containerId ?? draft.containerId;
  draft.fromId = event.fromId ?? draft.fromId;
  draft.toId = event.toId ?? draft.toId;
  draft.name = event.name ?? draft.name;
  draft.kind = event.kind ?? draft.kind;
  if (event.status && (draft.status === "open" || event.status !== "open")) {
    draft.status = event.status;
  }
  draft.metadata = { ...draft.metadata, ...event.metadata };

  if (event.eventType.endsWith(".started")) {
    draft.startedAtUnixMs = draft.startedAtUnixMs === null
      ? event.occurredAtUnixMs
      : Math.min(draft.startedAtUnixMs, event.occurredAtUnixMs);
  }
  if (event.eventType.endsWith(".ended")) {
    draft.endedAtUnixMs = draft.endedAtUnixMs === null
      ? event.occurredAtUnixMs
      : Math.max(draft.endedAtUnixMs, event.occurredAtUnixMs);
    if (draft.status === "open") draft.status = "ok";
  }

  map.set(event.entityId, draft);
}

function finalizeLifecycle(draft: EntityDraft): void {
  if (draft.startedAtUnixMs === null) draft.diagnostics.add("missingStart");
  if (draft.endedAtUnixMs === null) draft.diagnostics.add("missingEnd");
  if (
    draft.startedAtUnixMs !== null &&
    draft.endedAtUnixMs !== null &&
    draft.endedAtUnixMs < draft.startedAtUnixMs
  ) {
    draft.diagnostics.add("negativeDuration");
  }
}

function durationOf(draft: EntityDraft): number | null {
  if (draft.startedAtUnixMs === null || draft.endedAtUnixMs === null) return null;
  return draft.endedAtUnixMs - draft.startedAtUnixMs;
}

function computeAncestry(
  map: Map<string, EntityDraft>,
  orphanDiagnostic: DiagnosticCode | null,
): Map<string, { ancestry: string[] }> {
  const result = new Map<string, { ancestry: string[] }>();

  const visit = (id: string, seen: Set<string>): string[] => {
    const cached = result.get(id);
    if (cached) return cached.ancestry;

    const item = map.get(id);
    if (!item?.parentId) {
      result.set(id, { ancestry: [] });
      return [];
    }

    if (seen.has(id)) {
      item.diagnostics.add("cycleDetected");
      result.set(id, { ancestry: [] });
      return [];
    }

    const parent = map.get(item.parentId);
    if (!parent) {
      if (orphanDiagnostic) item.diagnostics.add(orphanDiagnostic);
      result.set(id, { ancestry: [] });
      return [];
    }

    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const ancestry = [...visit(parent.id, nextSeen), parent.id];
    result.set(id, { ancestry });
    return ancestry;
  };

  for (const id of map.keys()) visit(id, new Set());
  return result;
}

function computeFlowOrder(nodes: Map<string, EntityDraft>, edges: Map<string, EntityDraft>): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes.values()) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      adjacency.get(node.parentId)?.push(node.id);
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
    }
  }

  for (const edge of edges.values()) {
    if (edge.fromId && edge.toId && nodes.has(edge.fromId) && nodes.has(edge.toId)) {
      adjacency.get(edge.fromId)?.push(edge.toId);
      indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
    }
  }

  const queue = Array.from(nodes.values())
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort(compareDrafts);

  const order = new Map<string, number>();
  let index = 0;

  while (queue.length) {
    const node = queue.shift()!;
    if (order.has(node.id)) continue;
    order.set(node.id, index++);

    for (const childId of adjacency.get(node.id) ?? []) {
      indegree.set(childId, (indegree.get(childId) ?? 1) - 1);
      if ((indegree.get(childId) ?? 0) === 0) {
        const child = nodes.get(childId);
        if (child) queue.push(child);
        queue.sort(compareDrafts);
      }
    }
  }

  for (const node of Array.from(nodes.values()).sort(compareDrafts)) {
    if (!order.has(node.id)) {
      node.diagnostics.add("cycleDetected");
      order.set(node.id, index++);
    }
  }

  return order;
}

function compareDrafts(a: EntityDraft, b: EntityDraft): number {
  return (a.startedAtUnixMs ?? Number.MAX_SAFE_INTEGER) - (b.startedAtUnixMs ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id);
}

function countErrors(containers: ReadContainer[], nodes: ReadNode[], edges: ReadEdge[]): number {
  return [...containers, ...nodes, ...edges].filter((item) => item.status === "error").length;
}

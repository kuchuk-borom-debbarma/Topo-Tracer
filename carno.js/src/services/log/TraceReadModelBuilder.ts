import { Service } from "@carno.js/core";
import type { TraceReadModelProjector } from "./contracts";
import type {
  DiagnosticCode,
  JsonObject,
  ReadEdge,
  ReadNode,
  TraceEventRecord,
  TraceSummary,
} from "./types";

type NodeDraft = {
  id: string;
  traceId: string;
  name: string;
  importanceLevel: number | null;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  data: JsonObject;
  diagnostics: Set<DiagnosticCode>;
};

type EdgeDraft = {
  id: string;
  traceId: string;
  fromNodeId: string | null;
  toNodeId: string | null;
  label: string;
  status: string;
  startedAtUnixMs: number | null;
  endedAtUnixMs: number | null;
  data: JsonObject;
  diagnostics: Set<DiagnosticCode>;
};

@Service()
export class TraceReadModelBuilder implements TraceReadModelProjector {
  private lastMaterializedAtUnixMs = 0;

  build(traceId: string, events: TraceEventRecord[]): {
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: TraceSummary;
  } | null {
    if (!events.length) return null;

    const nodeDrafts = new Map<string, NodeDraft>();
    const edgeDrafts = new Map<string, EdgeDraft>();

    for (const event of events) {
      if (event.entityType === "node") applyNodeEvent(nodeDrafts, event);
      else applyEdgeEvent(edgeDrafts, event);
    }

    const flowOrder = computeFlowOrder(nodeDrafts, edgeDrafts);

    const nodes = Array.from(nodeDrafts.values()).map<ReadNode>((draft) => {
      finalizeLifecycle(draft, { missingEndIsDiagnostic: true });
      const importanceLevel = draft.importanceLevel ?? 0;
      return {
        id: draft.id,
        traceId: draft.traceId,
        name: draft.name,
        importanceLevel,
        status: draft.status,
        startedAtUnixMs: draft.startedAtUnixMs,
        endedAtUnixMs: draft.endedAtUnixMs,
        durationMs: durationOf(draft),
        flowOrder: flowOrder.get(draft.id) ?? Number.MAX_SAFE_INTEGER,
        diagnostics: Array.from(draft.diagnostics),
        data: draft.data,
      };
    }).sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id));

    const edges = Array.from(edgeDrafts.values()).map<ReadEdge>((draft) => {
      finalizeLifecycle(draft, { missingEndIsDiagnostic: false });
      if (!draft.fromNodeId || !draft.toNodeId || !nodeDrafts.has(draft.fromNodeId) || !nodeDrafts.has(draft.toNodeId)) {
        draft.diagnostics.add("orphanEdge");
      }

      const from = draft.fromNodeId ? nodeDrafts.get(draft.fromNodeId) : null;
      const to = draft.toNodeId ? nodeDrafts.get(draft.toNodeId) : null;
      if (from?.startedAtUnixMs && to?.startedAtUnixMs && from.startedAtUnixMs > to.startedAtUnixMs) {
        draft.diagnostics.add("clockSkewSuspected");
      }

      return {
        id: draft.id,
        traceId: draft.traceId,
        fromNodeId: draft.fromNodeId ?? "",
        toNodeId: draft.toNodeId ?? "",
        label: draft.label,
        status: draft.status,
        startedAtUnixMs: draft.startedAtUnixMs,
        endedAtUnixMs: draft.endedAtUnixMs,
        durationMs: durationOf(draft),
        diagnostics: Array.from(draft.diagnostics),
        data: draft.data,
      };
    });

    const diagnostics = [
      ...nodes.flatMap((node) => node.diagnostics),
      ...edges.flatMap((edge) => edge.diagnostics),
    ];
    const times = events.map((event) => event.occurredAtUnixMs);

    return {
      nodes,
      edges,
      summary: {
        traceId,
        createdAtUnixMs: Math.min(...times),
        updatedAtUnixMs: Math.max(...times),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        errorCount: [...nodes, ...edges].filter((item) => item.status === "error").length,
        diagnosticCount: diagnostics.length,
        maxImportanceLevel: nodes.reduce((max, node) => Math.max(max, node.importanceLevel), 0),
        materializedAtUnixMs: this.nextMaterializedAtUnixMs(),
      },
    };
  }

  private nextMaterializedAtUnixMs(): number {
    this.lastMaterializedAtUnixMs = Math.max(Date.now(), this.lastMaterializedAtUnixMs + 1);
    return this.lastMaterializedAtUnixMs;
  }
}

function applyNodeEvent(map: Map<string, NodeDraft>, event: TraceEventRecord): void {
  const draft = map.get(event.entityId) ?? {
    id: event.entityId,
    traceId: event.traceId,
    name: event.entityId,
    importanceLevel: null,
    status: "open",
    startedAtUnixMs: null,
    endedAtUnixMs: null,
    data: {},
    diagnostics: new Set<DiagnosticCode>(),
  };

  draft.name = event.name ?? draft.name;
  draft.importanceLevel = event.importanceLevel ?? draft.importanceLevel;
  draft.data = { ...draft.data, ...event.data };
  applyStatusAndTime(draft, event);
  map.set(event.entityId, draft);
}

function applyEdgeEvent(map: Map<string, EdgeDraft>, event: TraceEventRecord): void {
  const draft = map.get(event.entityId) ?? {
    id: event.entityId,
    traceId: event.traceId,
    fromNodeId: null,
    toNodeId: null,
    label: "connects",
    status: "open",
    startedAtUnixMs: null,
    endedAtUnixMs: null,
    data: {},
    diagnostics: new Set<DiagnosticCode>(),
  };

  draft.fromNodeId = event.fromNodeId ?? draft.fromNodeId;
  draft.toNodeId = event.toNodeId ?? draft.toNodeId;
  draft.label = event.label ?? draft.label;
  draft.data = { ...draft.data, ...event.data };
  applyStatusAndTime(draft, event);
  map.set(event.entityId, draft);
}

function applyStatusAndTime(draft: NodeDraft | EdgeDraft, event: TraceEventRecord): void {
  if (event.status && (draft.status === "open" || event.status !== "open")) draft.status = event.status;
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
}

function finalizeLifecycle(
  draft: NodeDraft | EdgeDraft,
  options: { missingEndIsDiagnostic: boolean },
): void {
  if (draft.startedAtUnixMs === null) draft.diagnostics.add("missingStart");
  if (options.missingEndIsDiagnostic && draft.endedAtUnixMs === null) draft.diagnostics.add("missingEnd");
  if (draft.startedAtUnixMs !== null && draft.endedAtUnixMs !== null && draft.endedAtUnixMs < draft.startedAtUnixMs) {
    draft.diagnostics.add("negativeDuration");
  }
}

function durationOf(draft: NodeDraft | EdgeDraft): number | null {
  if (draft.startedAtUnixMs === null || draft.endedAtUnixMs === null) return null;
  return draft.endedAtUnixMs - draft.startedAtUnixMs;
}

function computeFlowOrder(nodes: Map<string, NodeDraft>, edges: Map<string, EdgeDraft>): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes.values()) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of edges.values()) {
    if (edge.fromNodeId && edge.toNodeId && nodes.has(edge.fromNodeId) && nodes.has(edge.toNodeId)) {
      adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
      indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    }
  }

  const queue = Array.from(nodes.values()).filter((node) => (indegree.get(node.id) ?? 0) === 0).sort(compareDrafts);
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

function compareDrafts(a: NodeDraft, b: NodeDraft): number {
  return (a.startedAtUnixMs ?? Number.MAX_SAFE_INTEGER) - (b.startedAtUnixMs ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id);
}

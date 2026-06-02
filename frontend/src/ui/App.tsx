import { useQuery } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchGraph, fetchTraces } from "../api";
import type { GraphEdge, GraphWindowResponse, ReadNode, TraceSummary } from "../types";

const NODE_WIDTH = 278;
const NODE_HEIGHT = 116;
const COLUMN_GAP = 330;
const ROW_GAP = 154;
const BOARD_PADDING_X = 72;
const BOARD_PADDING_Y = 56;

type AppRoute = { page: "list" } | { page: "graph"; traceId: string };
type Inspectable = ReadNode | GraphEdge;
type TraceNodeData = { node: ReadNode; subtitle: string };
type TraceEdgeData = { edge: GraphEdge };
type TraceFlowNode = Node<TraceNodeData, "trace">;
type TraceFlowEdge = Edge<TraceEdgeData>;

export function App() {
  const [route, setRoute] = useState(() => readRoute());
  const [cursor, setCursor] = useState<string | null>(null);
  const [maxImportance, setMaxImportance] = useState(2);
  const [selectedItem, setSelectedItem] = useState<Inspectable | null>(null);
  const [isTraceRailCollapsed, setIsTraceRailCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  const tracesQuery = useQuery({ queryKey: ["traces"], queryFn: () => fetchTraces() });
  const activeTraceId = route.page === "graph" ? route.traceId : null;
  const activeSummary = tracesQuery.data?.traces.find((trace) => trace.traceId === activeTraceId);

  const graphQuery = useQuery({
    queryKey: ["graph", activeTraceId, maxImportance, cursor],
    queryFn: () => fetchGraph({ traceId: activeTraceId!, maxImportance, cursor, limit: 250 }),
    enabled: Boolean(activeTraceId),
  });

  useEffect(() => {
    const onPopState = () => {
      setRoute(readRoute());
      setCursor(null);
      setSelectedItem(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const graph = graphQuery.data;
    if (!selectedItem || !graph) return;
    const exists = [...graph.nodes, ...graph.edges].some((item) => item.id === selectedItem.id);
    if (!exists) setSelectedItem(null);
  }, [graphQuery.data, selectedItem]);

  const summary = graphQuery.data?.summary ?? activeSummary;

  return (
    <div className={`app-shell ${isTraceRailCollapsed ? "trace-collapsed" : ""} ${isInspectorCollapsed ? "inspector-collapsed" : ""}`}>
      <TraceRail
        traces={tracesQuery.data?.traces ?? []}
        activeTraceId={activeTraceId}
        isLoading={tracesQuery.isLoading}
        isError={tracesQuery.isError}
        isCollapsed={isTraceRailCollapsed}
        onToggleCollapsed={() => setIsTraceRailCollapsed((value) => !value)}
        onRefresh={() => tracesQuery.refetch()}
        onSelect={(traceId) => {
          navigateToTrace(traceId, setRoute);
          setCursor(null);
          setSelectedItem(null);
        }}
      />

      <main className="graph-workspace">
        <GraphHeader
          graph={graphQuery.data}
          summary={summary}
          maxImportance={maxImportance}
          traceId={activeTraceId}
          isLoading={graphQuery.isLoading}
          onRefresh={() => {
            tracesQuery.refetch();
            graphQuery.refetch();
          }}
          onImportanceChange={(importance) => {
            setMaxImportance(importance);
            setCursor(null);
            setSelectedItem(null);
          }}
          onPrevious={() => setCursor(graphQuery.data?.metadata.previousCursor ?? null)}
          onNext={() => setCursor(graphQuery.data?.metadata.nextCursor ?? null)}
        />
        <TraceGraphCanvas
          graph={graphQuery.data}
          isError={graphQuery.isError}
          selectedId={selectedItem?.id ?? null}
          onSelect={setSelectedItem}
          onClearSelection={() => setSelectedItem(null)}
        />
      </main>

      <Inspector
        item={selectedItem}
        graph={graphQuery.data}
        isCollapsed={isInspectorCollapsed}
        onToggleCollapsed={() => setIsInspectorCollapsed((value) => !value)}
      />
    </div>
  );
}

function TraceRail(props: {
  traces: TraceSummary[];
  activeTraceId: string | null;
  isLoading: boolean;
  isError: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onRefresh: () => void;
  onSelect: (traceId: string) => void;
}) {
  if (props.isCollapsed) {
    return (
      <aside className="trace-rail collapsed-panel">
        <button className="panel-toggle" onClick={props.onToggleCollapsed} aria-label="Expand trace list">
          &gt;
        </button>
        <span className="brand-mark compact">TT</span>
      </aside>
    );
  }

  return (
    <aside className="trace-rail">
      <div className="rail-brand">
        <span className="brand-mark">TT</span>
        <div>
          <h1>Topo Tracer</h1>
          <p>{props.traces.length} traces</p>
        </div>
        <button className="panel-toggle" onClick={props.onToggleCollapsed} aria-label="Collapse trace list">
          &lt;
        </button>
      </div>

      <div className="rail-actions">
        <button className="secondary-button" onClick={props.onRefresh}>Refresh</button>
      </div>

      <div className="trace-list">
        {props.isLoading && <div className="empty-state">Loading traces</div>}
        {!props.isLoading && props.isError && <div className="empty-state">Backend unavailable</div>}
        {!props.isLoading && !props.isError && props.traces.length === 0 && <div className="empty-state">No traces yet</div>}
        {props.traces.map((trace) => (
          <button
            key={trace.traceId}
            className={`trace-row ${trace.traceId === props.activeTraceId ? "active" : ""}`}
            onClick={() => props.onSelect(trace.traceId)}
          >
            <span className="trace-id">{trace.traceId}</span>
            <span>{trace.nodeCount} nodes</span>
            <span>{trace.errorCount} errors · max {trace.maxImportanceLevel ?? 0}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function GraphHeader(props: {
  graph?: GraphWindowResponse | null;
  summary?: TraceSummary;
  maxImportance: number;
  traceId: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  onImportanceChange: (importance: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const max = Math.max(0, props.summary?.maxImportanceLevel ?? props.maxImportance);
  return (
    <header className="graph-header">
      <div className="header-main">
        <p className="eyebrow">Graph</p>
        <h2>{props.traceId ?? "Select trace"}</h2>
        <div className="header-stats">
          <span>{props.graph?.metadata.returnedNodeCount ?? 0}/{props.summary?.nodeCount ?? 0} nodes</span>
          <span>{props.graph?.edges.length ?? 0} edges</span>
          <span>{props.graph?.metadata.hiddenNodeCount ?? 0} hidden</span>
          <span>{props.summary?.diagnosticCount ?? 0} diagnostics</span>
        </div>
      </div>

      <div className="header-controls">
        <label className="importance-control">
          <span>Importance &lt;= {props.maxImportance}</span>
          <input
            type="range"
            min={0}
            max={max}
            value={props.maxImportance}
            onChange={(event) => props.onImportanceChange(Number(event.currentTarget.value))}
          />
        </label>
        <div className="button-group">
          <button className="secondary-button" disabled={!props.graph?.metadata.hasBefore} onClick={props.onPrevious}>
            Prev
          </button>
          <button className="secondary-button" disabled={!props.graph?.metadata.hasAfter} onClick={props.onNext}>
            Next
          </button>
          <button className="primary-button" disabled={!props.traceId || props.isLoading} onClick={props.onRefresh}>
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

function TraceGraphCanvas(props: {
  graph?: GraphWindowResponse | null;
  isError: boolean;
  selectedId: string | null;
  onSelect: (item: Inspectable) => void;
  onClearSelection: () => void;
}) {
  const flow = useMemo(() => buildFlowData(props.graph, props.selectedId), [props.graph, props.selectedId]);

  if (!props.graph) {
    return (
      <section className="graph-canvas empty-graph">
        <div className="empty-state">{props.isError ? "Graph unavailable" : "Select trace"}</div>
      </section>
    );
  }

  return (
    <section className="graph-canvas react-flow-shell">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.15 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "smoothstep",
          interactionWidth: 18,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        }}
        onPaneClick={props.onClearSelection}
        onNodeClick={(_, node) => {
          const readNode = flow.nodeById.get(node.id);
          if (readNode) props.onSelect(readNode);
        }}
        onEdgeClick={(_, edge) => {
          const readEdge = flow.edgeById.get(edge.id);
          if (readEdge) props.onSelect(readEdge);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.4} color="#d7dde5" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => String(node.style?.background ?? "#94a3b8")}
          maskColor="rgba(248, 250, 252, 0.68)"
          bgColor="#ffffff"
        />
      </ReactFlow>
    </section>
  );
}

function Inspector(props: {
  item: Inspectable | null;
  graph?: GraphWindowResponse | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (props.isCollapsed) {
    return (
      <aside className="inspector collapsed-panel">
        <button className="panel-toggle" onClick={props.onToggleCollapsed} aria-label="Expand inspector">
          &lt;
        </button>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <div>
          <p className="eyebrow">Inspector</p>
          <h3>{props.item ? ("fromNodeId" in props.item ? "Edge" : "Node") : "Nothing selected"}</h3>
        </div>
        <button className="panel-toggle" onClick={props.onToggleCollapsed} aria-label="Collapse inspector">
          &gt;
        </button>
      </div>

      {!props.item && <div className="empty-state">Select node or edge</div>}

      {props.item && (
        <div className="inspector-body">
          <h4>{"fromNodeId" in props.item ? props.item.label : props.item.name}</h4>
          <dl>
            <dt>ID</dt>
            <dd>{props.item.id}</dd>
            <dt>Status</dt>
            <dd>{props.item.status}</dd>
            {"fromNodeId" in props.item && (
              <>
                <dt>From</dt>
                <dd>{props.item.fromNodeId}</dd>
                <dt>To</dt>
                <dd>{props.item.toNodeId}</dd>
              </>
            )}
            <dt>Duration</dt>
            <dd>{formatDuration(props.item.durationMs)}</dd>
            <dt>Started</dt>
            <dd>{formatTimestamp(props.item.startedAtUnixMs)}</dd>
            <dt>Ended</dt>
            <dd>{formatTimestamp(props.item.endedAtUnixMs)}</dd>
            <dt>Diagnostics</dt>
            <dd>{props.item.diagnostics.length ? props.item.diagnostics.join(", ") : "none"}</dd>
          </dl>
          <pre>{JSON.stringify(props.item.data, null, 2)}</pre>
        </div>
      )}

      {props.graph && (
        <div className="summary-strip">
          <span>{props.graph.summary.nodeCount} nodes</span>
          <span>{props.graph.summary.edgeCount} edges</span>
          <span>{props.graph.summary.maxImportanceLevel ?? 0} max importance</span>
        </div>
      )}
    </aside>
  );
}

const TraceNode = memo(function TraceNode(props: NodeProps<TraceFlowNode>) {
  const node = props.data.node;
  return (
    <div className={`flow-node ${node.status} ${node.isGhost ? "ghost" : ""} ${props.selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-top">
        <span className="status-dot" />
        <span>{capitalize(node.status)}</span>
        <strong>i{importanceOf(node)}</strong>
      </div>
      <div className="flow-node-title">{node.name}</div>
      <div className="flow-node-meta">{props.data.subtitle}</div>
      {node.diagnostics.length > 0 && <em>{node.diagnostics.length} diagnostics</em>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = { trace: TraceNode };

function buildFlowData(graph?: GraphWindowResponse | null, selectedId?: string | null): {
  nodes: TraceFlowNode[];
  edges: TraceFlowEdge[];
  nodeById: Map<string, ReadNode>;
  edgeById: Map<string, GraphEdge>;
} {
  const readNodes = [...(graph?.nodes ?? [])].sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id));
  const readEdges = graph?.edges ?? [];
  const nodeById = new Map(readNodes.map((node) => [node.id, node]));
  const edgeById = new Map(readEdges.map((edge) => [edge.id, edge]));
  const positions = layoutNodes(readNodes, readEdges);

  const nodes = readNodes.map<TraceFlowNode>((node) => ({
    id: node.id,
    type: "trace",
    data: { node, subtitle: nodeSubtitle(node) },
    position: positions.get(node.id) ?? { x: BOARD_PADDING_X, y: BOARD_PADDING_Y },
    selected: selectedId === node.id,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: { width: NODE_WIDTH, background: nodeFill(node) },
  }));

  const edges = readEdges
    .filter((edge) => nodeById.has(edge.fromNodeId) && nodeById.has(edge.toNodeId))
    .map<TraceFlowEdge>((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      data: { edge },
      label: edgeLabel(edge),
      selected: selectedId === edge.id,
      animated: edge.status === "open",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(edge), width: 18, height: 18 },
      style: {
        stroke: edgeColor(edge),
        strokeWidth: selectedId === edge.id ? 3 : edge.isGhost ? 1.6 : 2.2,
        strokeDasharray: edge.isGhost || edge.status === "open" ? "7 7" : undefined,
      },
      labelStyle: { fill: edgeColor(edge), fontWeight: 800, fontSize: 12 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.86 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 5,
    }));

  return { nodes, edges, nodeById, edgeById };
}

function layoutNodes(nodes: ReadNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeById.has(edge.fromNodeId) || !nodeById.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  }

  for (const list of [...outgoing.values(), ...incoming.values()]) {
    list.sort((a, b) => compareNodes(nodeById.get(a)!, nodeById.get(b)!));
  }

  const rank = assignRanks(nodes, outgoing, incoming);
  const byRank = new Map<number, ReadNode[]>();
  for (const node of nodes) {
    const bucket = byRank.get(rank.get(node.id) ?? 0) ?? [];
    bucket.push(node);
    byRank.set(rank.get(node.id) ?? 0, bucket);
  }

  const orderedRanks = Array.from(byRank.keys()).sort((a, b) => a - b);
  const order = new Map<string, number>();
  for (const level of orderedRanks) {
    const bucket = byRank.get(level)!;
    bucket.sort(compareNodes);
    bucket.forEach((node, index) => order.set(node.id, index));
  }

  // Barycentric sweeps: children stay near parents; siblings fan downward.
  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (const level of orderedRanks) {
      const bucket = byRank.get(level)!;
      bucket.sort((a, b) => laneScore(a.id, incoming, order) - laneScore(b.id, incoming, order) || compareNodes(a, b));
      bucket.forEach((node, index) => order.set(node.id, index));
    }
    for (const level of [...orderedRanks].reverse()) {
      const bucket = byRank.get(level)!;
      bucket.sort((a, b) => laneScore(a.id, outgoing, order) - laneScore(b.id, outgoing, order) || compareNodes(a, b));
      bucket.forEach((node, index) => order.set(node.id, index));
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  const maxRows = Math.max(...Array.from(byRank.values()).map((bucket) => bucket.length), 1);
  for (const level of orderedRanks) {
    const bucket = byRank.get(level)!;
    bucket.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const yOffset = ((maxRows - bucket.length) * ROW_GAP) / 2;
    bucket.forEach((node, index) => {
      positions.set(node.id, {
        x: BOARD_PADDING_X + level * COLUMN_GAP,
        y: BOARD_PADDING_Y + yOffset + index * ROW_GAP,
      });
    });
  }

  return positions;
}

function assignRanks(
  nodes: ReadNode[],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): Map<string, number> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const remainingIncoming = new Map(nodes.map((node) => [node.id, incoming.get(node.id)?.length ?? 0]));
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes
    .filter((node) => (remainingIncoming.get(node.id) ?? 0) === 0)
    .sort(compareNodes)
    .map((node) => node.id);
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const targetId of outgoing.get(id) ?? []) {
      rank.set(targetId, Math.max(rank.get(targetId) ?? 0, (rank.get(id) ?? 0) + 1));
      remainingIncoming.set(targetId, (remainingIncoming.get(targetId) ?? 1) - 1);
      if ((remainingIncoming.get(targetId) ?? 0) <= 0) {
        queue.push(targetId);
        queue.sort((a, b) => compareNodes(nodeById.get(a)!, nodeById.get(b)!));
      }
    }
  }

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const parentRanks = (incoming.get(node.id) ?? []).map((id) => rank.get(id) ?? 0);
    rank.set(node.id, parentRanks.length ? Math.max(...parentRanks) + 1 : 0);
  }

  return compressRanks(rank);
}

function compressRanks(rank: Map<string, number>): Map<string, number> {
  const levels = Array.from(new Set(rank.values())).sort((a, b) => a - b);
  const remap = new Map(levels.map((level, index) => [level, index]));
  return new Map(Array.from(rank.entries()).map(([id, level]) => [id, remap.get(level) ?? 0]));
}

function laneScore(id: string, links: Map<string, string[]>, order: Map<string, number>): number {
  const linked = links.get(id) ?? [];
  if (!linked.length) return order.get(id) ?? 0;
  return linked.reduce((sum, linkedId) => sum + (order.get(linkedId) ?? 0), 0) / linked.length;
}

function compareNodes(a: ReadNode, b: ReadNode): number {
  return a.flowOrder - b.flowOrder || (a.startedAtUnixMs ?? 0) - (b.startedAtUnixMs ?? 0) || a.id.localeCompare(b.id);
}

function nodeSubtitle(node: ReadNode): string {
  if (isGhostNode(node)) return `${node.hiddenNodeCount} hidden · ${node.hiddenErrorCount} errors`;
  return `${formatDuration(node.durationMs)} · ${formatTimestamp(node.startedAtUnixMs)} -> ${formatTimestamp(node.endedAtUnixMs)}`;
}

function nodeFill(node: ReadNode): string {
  if (isGhostNode(node)) return "#64748b";
  if (node.status === "error") return "#c2410c";
  if (node.status === "warning" || node.status === "open") return "#b7791f";
  if (node.importanceLevel === 0) return "#0f766e";
  if (node.importanceLevel === 1) return "#2563eb";
  if (node.importanceLevel === 2) return "#7c3aed";
  return "#7c8aa0";
}

function edgeColor(edge: GraphEdge): string {
  if (edge.status === "error") return "#c2410c";
  if (edge.status === "warning" || edge.status === "open") return "#b7791f";
  if (edge.isGhost) return "#64748b";
  return "#2563eb";
}

function importanceOf(node: ReadNode): number {
  return Number.isFinite(node.importanceLevel) ? Math.max(0, Math.floor(node.importanceLevel)) : 0;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "open";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function edgeLabel(edge: GraphEdge): string {
  const hidden = edge.hiddenEdgeCount && edge.hiddenEdgeCount > 1 ? ` x${edge.hiddenEdgeCount}` : "";
  if (edge.status === "open") return `${edge.label}${hidden} · open`;
  return `${edge.label}${hidden}`;
}

function isGhostNode(node: ReadNode): node is ReadNode & {
  isGhost: true;
  hiddenNodeCount: number;
  hiddenErrorCount: number;
  hiddenDurationMs: number | null;
} {
  return node.isGhost === true;
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}`
    : value;
}

function formatTimestamp(timestampMs: number | null): string {
  if (timestampMs === null) return "open";
  const date = new Date(timestampMs);
  return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function readRoute(): AppRoute {
  const match = window.location.pathname.match(/^\/traces\/([^/]+)\/graph$/);
  if (!match) return { page: "list" };
  return { page: "graph", traceId: decodeURIComponent(match[1]) };
}

function navigateToTrace(traceId: string, setRoute: (route: AppRoute) => void): void {
  const route: AppRoute = { page: "graph", traceId };
  window.history.pushState(null, "", `/traces/${encodeURIComponent(traceId)}/graph`);
  setRoute(route);
}

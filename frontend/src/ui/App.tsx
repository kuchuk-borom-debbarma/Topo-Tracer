import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GraphCanvas as ReagraphCanvas,
  lightTheme,
  type GraphCanvasRef,
  type GraphEdge as ReagraphEdge,
  type GraphNode as ReagraphNode,
  type InternalGraphEdge,
  type InternalGraphNode,
  type Theme,
} from "reagraph";
import { fetchGraph, fetchTraces } from "../api";
import type { GraphEdge, GraphWindowResponse, ReadNode, TraceSummary } from "../types";

type AppRoute = { page: "list" } | { page: "graph"; traceId: string };
type Inspectable = ReadNode | GraphEdge;

const graphTheme: Theme = {
  ...lightTheme,
  canvas: {
    background: "#f8fafc",
    fog: "#f8fafc",
  },
  node: {
    ...lightTheme.node,
    fill: "#2563eb",
    activeFill: "#0f766e",
    inactiveOpacity: 0.18,
    label: {
      ...lightTheme.node.label,
      color: "#17202a",
      stroke: "#ffffff",
      activeColor: "#0f766e",
      backgroundColor: "#ffffff",
      backgroundOpacity: 0.86,
      padding: 4,
      radius: 5,
    },
    subLabel: {
      color: "#667085",
      stroke: "#ffffff",
      activeColor: "#0f766e",
    },
  },
  ring: {
    fill: "#dbeafe",
    activeFill: "#14b8a6",
  },
  edge: {
    ...lightTheme.edge,
    fill: "#7c8aa0",
    activeFill: "#0f766e",
    opacity: 0.82,
    selectedOpacity: 1,
    inactiveOpacity: 0.12,
    label: {
      color: "#344054",
      stroke: "#ffffff",
      activeColor: "#0f766e",
      fontSize: 11,
    },
    subLabel: {
      color: "#667085",
      stroke: "#ffffff",
      activeColor: "#0f766e",
      fontSize: 9,
    },
  },
  arrow: {
    fill: "#7c8aa0",
    activeFill: "#0f766e",
  },
  lasso: {
    background: "rgba(20, 184, 166, 0.1)",
    border: "1px solid rgba(15, 118, 110, 0.4)",
  },
  cluster: {
    stroke: "#d7dde5",
    fill: "#ffffff",
    opacity: 0.16,
    selectedOpacity: 0.28,
    inactiveOpacity: 0.06,
    label: {
      color: "#667085",
      stroke: "#ffffff",
      fontSize: 12,
    },
  },
};

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
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const data = useMemo(() => buildReagraphData(props.graph), [props.graph]);

  useEffect(() => {
    window.requestAnimationFrame(() => graphRef.current?.fitNodesInView?.());
  }, [props.graph?.metadata.traceId, props.graph?.metadata.maxImportance, props.graph?.metadata.nextCursor]);

  if (!props.graph) {
    return (
      <section className="graph-canvas empty-graph">
        <div className="empty-state">{props.isError ? "Graph unavailable" : "Select trace"}</div>
      </section>
    );
  }

  return (
    <section className="graph-canvas reagraph-shell">
      <ReagraphCanvas
        ref={graphRef}
        nodes={data.nodes}
        edges={data.edges}
        selections={props.selectedId ? [props.selectedId] : []}
        actives={props.selectedId ? [props.selectedId] : []}
        theme={graphTheme}
        animated
        draggable
        aggregateEdges={false}
        cameraMode="pan"
        defaultNodeSize={9}
        minNodeSize={6}
        maxNodeSize={18}
        layoutType="forceDirected2d"
        layoutOverrides={{
          centerInertia: 0.55,
          linkDistance: 360,
          nodeStrength: -1400,
          nodeLevelRatio: 1.7,
        }}
        edgeArrowPosition="end"
        edgeInterpolation="curved"
        edgeLabelPosition="natural"
        labelType="nodes"
        maxDistance={70000}
        minDistance={120}
        onCanvasClick={props.onClearSelection}
        onNodeClick={(node: InternalGraphNode) => {
          const readNode = data.nodeById.get(node.id);
          if (readNode) props.onSelect(readNode);
        }}
        onEdgeClick={(edge: InternalGraphEdge) => {
          const readEdge = data.edgeById.get(edge.id);
          if (readEdge) props.onSelect(readEdge);
        }}
      />
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

function buildReagraphData(graph?: GraphWindowResponse | null): {
  nodes: ReagraphNode[];
  edges: ReagraphEdge[];
  nodeById: Map<string, ReadNode>;
  edgeById: Map<string, GraphEdge>;
} {
  const readNodes = [...(graph?.nodes ?? [])].sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id));
  const readEdges = graph?.edges ?? [];
  const nodeById = new Map(readNodes.map((node) => [node.id, node]));
  const edgeById = new Map(readEdges.map((edge) => [edge.id, edge]));

  const nodes = readNodes.map<ReagraphNode>((node) => ({
    id: node.id,
    label: node.name,
    subLabel: nodeSubLabel(node),
    labelVisible: readNodes.length <= 80 || node.importanceLevel <= 1 || node.isGhost === true,
    size: nodeSize(node),
    fill: nodeFill(node),
    cluster: nodeCluster(node),
    data: { node },
  }));

  const edges = readEdges
    .filter((edge) => nodeById.has(edge.fromNodeId) && nodeById.has(edge.toNodeId))
    .map<ReagraphEdge>((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      label: edgeLabel(edge),
      subLabel: edge.durationMs === null ? edge.status : formatDuration(edge.durationMs),
      fill: edgeFill(edge),
      dashed: edge.isGhost === true || edge.status === "open",
      dashArray: edge.status === "open" ? [10, 8] : [6, 8],
      interpolation: "curved",
      arrowPlacement: "end",
      data: { edge },
      labelVisible: readEdges.length <= 120 || edge.status !== "ok" || edge.isGhost === true,
    }));

  return { nodes, edges, nodeById, edgeById };
}

function nodeSubLabel(node: ReadNode): string {
  if (isGhostNode(node)) return `${node.hiddenNodeCount} hidden · ${node.hiddenErrorCount} errors`;
  return `${capitalize(node.status)} · i${importanceOf(node)} · ${formatDuration(node.durationMs)}`;
}

function nodeSize(node: ReadNode): number {
  if (isGhostNode(node)) return Math.min(18, 10 + Math.sqrt(node.hiddenNodeCount) * 0.7);
  if (node.status === "error") return 15;
  if (node.importanceLevel === 0) return 16;
  if (node.importanceLevel === 1) return 13;
  return 10;
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

function nodeCluster(node: ReadNode): string {
  if (isGhostNode(node)) return "hidden";
  if (node.status === "error") return "error";
  if (node.importanceLevel === 0) return "critical";
  if (node.importanceLevel === 1) return "service";
  return "detail";
}

function edgeFill(edge: GraphEdge): string {
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
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
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

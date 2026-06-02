import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchGraph, fetchTraces } from "../api";
import type { GraphEdge, GraphWindowResponse, ReadNode, TraceSummary } from "../types";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 112;
const COLUMN_GAP = 336;
const ROW_GAP = 152;
const BOARD_PADDING = 42;
const IMPORTANCE_LABELS = ["Critical", "Service", "Operation", "Detail", "Noise"];

type AppRoute = { page: "list" } | { page: "graph"; traceId: string };
type Inspectable = ReadNode | GraphEdge;

export function App() {
  const [route, setRoute] = useState(() => readRoute());
  const [cursor, setCursor] = useState<string | null>(null);
  const [maxImportance, setMaxImportance] = useState(2);
  const [selectedItem, setSelectedItem] = useState<Inspectable | null>(null);

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
    <div className="app-shell">
      <TraceRail
        traces={tracesQuery.data?.traces ?? []}
        activeTraceId={activeTraceId}
        isLoading={tracesQuery.isLoading}
        isError={tracesQuery.isError}
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
          }}
          onPrevious={() => setCursor(graphQuery.data?.metadata.previousCursor ?? null)}
          onNext={() => setCursor(graphQuery.data?.metadata.nextCursor ?? null)}
        />
        <GraphCanvas
          graph={graphQuery.data}
          isError={graphQuery.isError}
          selectedId={selectedItem?.id ?? null}
          onSelect={setSelectedItem}
        />
      </main>

      <Inspector item={selectedItem} graph={graphQuery.data} />
    </div>
  );
}

function TraceRail(props: {
  traces: TraceSummary[];
  activeTraceId: string | null;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
  onSelect: (traceId: string) => void;
}) {
  return (
    <aside className="trace-rail">
      <div className="rail-brand">
        <span className="brand-mark">TT</span>
        <div>
          <h1>Topo Tracer</h1>
          <p>{props.traces.length} traces</p>
        </div>
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

function GraphCanvas(props: {
  graph?: GraphWindowResponse | null;
  isError: boolean;
  selectedId: string | null;
  onSelect: (item: Inspectable) => void;
}) {
  const layout = useMemo(() => buildImportanceLayout(props.graph), [props.graph]);
  const canvasRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    canvasRef.current?.scrollTo({ left: 0, top: 0 });
  }, [props.graph?.metadata.traceId, props.graph?.metadata.maxImportance, props.graph?.metadata.nextCursor]);

  if (!props.graph) {
    return (
      <section className="graph-canvas empty-graph">
        <div className="empty-state">{props.isError ? "Graph unavailable" : "Select trace"}</div>
      </section>
    );
  }

  return (
    <section className="graph-canvas" ref={canvasRef}>
      <div className="graph-board" style={{ width: layout.width, height: layout.height }}>
        {layout.columns.map((column) => (
          <div
            key={column.level}
            className="importance-column"
            style={{ left: column.x, height: layout.height - BOARD_PADDING * 2 }}
          >
            <span>{column.label}</span>
          </div>
        ))}

        <svg className="graph-arrows" width={layout.width} height={layout.height}>
          <defs>
            <marker id="graph-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
            <marker id="graph-arrow-open" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
            <marker id="graph-arrow-muted" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
          </defs>
          {layout.edges.map(({ edge, path, labelPosition, direction }) => {
            const markerId = edge.isGhost ? "graph-arrow-muted" : edge.status === "open" ? "graph-arrow-open" : "graph-arrow";
            return (
              <g
                key={edge.id}
                className={`graph-edge ${edge.status} ${edge.isGhost ? "ghost" : ""} ${direction}`}
                onClick={() => props.onSelect(edge)}
              >
                <path d={path} markerEnd={`url(#${markerId})`} />
                <text x={labelPosition.x} y={labelPosition.y}>{edgeLabel(edge)}</text>
              </g>
            );
          })}
        </svg>

        {layout.nodes.map(({ node, position }) => (
          <button
            key={node.id}
            className={`graph-node ${node.status} ${node.isGhost ? "ghost" : ""} ${props.selectedId === node.id ? "selected" : ""}`}
            style={{ left: position.x, top: position.y }}
            onClick={() => props.onSelect(node)}
          >
            <span className="node-topline">
              <span className="status-dot" />
              <span>{node.status}</span>
              <strong>i{importanceOf(node)}</strong>
            </span>
            <span className="node-title">{node.name}</span>
            <span>{formatDuration(node.durationMs)} · {formatTimeRange(node.startedAtUnixMs, node.endedAtUnixMs)}</span>
            {isGhostNode(node) && (
              <span>{node.hiddenNodeCount} hidden · {node.hiddenErrorCount} errors</span>
            )}
            {node.diagnostics.length > 0 && <em>{node.diagnostics.length} diagnostics</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function Inspector(props: { item: Inspectable | null; graph?: GraphWindowResponse | null }) {
  return (
    <aside className="inspector">
      <div className="inspector-header">
        <p className="eyebrow">Inspector</p>
        <h3>{props.item ? ("fromNodeId" in props.item ? "Edge" : "Node") : "Nothing selected"}</h3>
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

function buildImportanceLayout(graph?: GraphWindowResponse | null) {
  const nodes = [...(graph?.nodes ?? [])].sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id));
  const edges = graph?.edges ?? [];
  const maxLevel = Math.max(
    graph?.metadata.maxImportance ?? 0,
    ...nodes.map((node) => importanceOf(node)),
  );
  const columnCount = Math.max(1, maxLevel + 1);
  const groupedNodes = new Map<number, ReadNode[]>();
  const positions = new Map<string, { x: number; y: number }>();

  for (const node of nodes) {
    const level = importanceOf(node);
    const group = groupedNodes.get(level) ?? [];
    group.push(node);
    groupedNodes.set(level, group);
  }

  const laidOutNodes = nodes.map((node) => {
    const level = importanceOf(node);
    const row = groupedNodes.get(level)?.findIndex((item) => item.id === node.id) ?? 0;
    const position = {
      x: BOARD_PADDING + level * COLUMN_GAP,
      y: BOARD_PADDING + 46 + row * ROW_GAP,
    };
    positions.set(node.id, position);
    return { node, position };
  });

  const maxRows = Math.max(1, ...Array.from(groupedNodes.values()).map((group) => group.length));
  const laidOutEdges = edges.flatMap((edge) => {
    const from = positions.get(edge.fromNodeId);
    const to = positions.get(edge.toNodeId);
    if (!from || !to) return [];

    const x1 = from.x + NODE_WIDTH;
    const y1 = from.y + NODE_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_HEIGHT / 2;
    const direction = x2 >= x1 ? "forward" : "return";
    const path = direction === "forward"
      ? `M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + 92} ${y1 - 72}, ${x2 - 92} ${y2 - 72}, ${x2} ${y2}`;

    return [{
      edge,
      path,
      direction,
      labelPosition: {
        x: direction === "forward" ? (x1 + x2) / 2 : Math.max(x2, x1) + 12,
        y: direction === "forward" ? (y1 + y2) / 2 - 8 : Math.min(y1, y2) - 64,
      },
    }];
  });

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    columns: Array.from({ length: columnCount }, (_, level) => ({
      level,
      x: BOARD_PADDING + level * COLUMN_GAP - 14,
      label: `i${level} ${IMPORTANCE_LABELS[level] ?? "Detail"}`,
    })),
    width: Math.max(980, BOARD_PADDING * 2 + columnCount * COLUMN_GAP + NODE_WIDTH),
    height: Math.max(620, BOARD_PADDING * 2 + 46 + maxRows * ROW_GAP + NODE_HEIGHT),
  };
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

function formatTimestamp(timestampMs: number | null): string {
  if (timestampMs === null) return "open";
  const date = new Date(timestampMs);
  return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function formatTimeRange(startMs: number | null, endMs: number | null): string {
  return `${formatTimestamp(startMs)} -> ${formatTimestamp(endMs)}`;
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

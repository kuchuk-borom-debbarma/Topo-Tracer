import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchGraph, fetchTraces } from "../api";
import type { GraphEdge, GraphWindowResponse, ReadNode, TraceSummary } from "../types";

const MAX_VISUAL_INDENT = 8;
const NODE_WIDTH = 280;
const NODE_HEIGHT = 122;
const INDENT_GAP = 360;
const FLOW_GAP = 168;
const BOARD_PADDING = 42;

type AppRoute = { page: "list" } | { page: "graph"; traceId: string };

export function App() {
  const [route, setRoute] = useState(() => readRoute());
  const [cursor, setCursor] = useState<string | null>(null);
  const [maxImportance, setMaxImportance] = useState(2);
  const [selectedItem, setSelectedItem] = useState<ReadNode | GraphEdge | null>(null);

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

  if (route.page === "list") {
    return (
      <div className="list-page">
        <div className="brand">
          <span className="brand-mark">TT</span>
          <div>
            <h1>Topo Tracer</h1>
            <p>Primitive node graph</p>
          </div>
        </div>
        <TraceList
          traces={tracesQuery.data?.traces ?? []}
          activeTraceId={null}
          isLoading={tracesQuery.isLoading}
          onSelect={(traceId) => {
            navigateToTrace(traceId, setRoute);
            setCursor(null);
            setSelectedItem(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="graph-page">
      <main className="graph-area">
        <GraphToolbar
          graph={graphQuery.data}
          summary={activeSummary}
          maxImportance={maxImportance}
          traceId={activeTraceId}
          onBack={() => {
            navigateToList(setRoute);
            setCursor(null);
            setSelectedItem(null);
          }}
          onImportanceChange={(importance) => {
            setMaxImportance(importance);
            setCursor(null);
          }}
          onPrevious={() => setCursor(graphQuery.data?.metadata.previousCursor ?? null)}
          onNext={() => setCursor(graphQuery.data?.metadata.nextCursor ?? null)}
        />
        <GraphView graph={graphQuery.data} selectedId={selectedItem?.id ?? null} onSelect={setSelectedItem} />
      </main>

      <Inspector item={selectedItem} graph={graphQuery.data} />
    </div>
  );
}

function TraceList(props: {
  traces: TraceSummary[];
  activeTraceId: string | null;
  isLoading: boolean;
  onSelect: (traceId: string) => void;
}) {
  return (
    <div className="trace-list">
      <div className="section-title">Traces</div>
      {props.isLoading && <div className="empty-state">Loading traces</div>}
      {!props.isLoading && props.traces.length === 0 && <div className="empty-state">No traces yet</div>}
      {props.traces.map((trace) => (
        <button
          key={trace.traceId}
          className={`trace-row ${trace.traceId === props.activeTraceId ? "active" : ""}`}
          onClick={() => props.onSelect(trace.traceId)}
        >
          <span className="trace-id">{trace.traceId}</span>
          <span>{trace.nodeCount} nodes · max importance {trace.maxImportanceLevel ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function GraphToolbar(props: {
  graph?: GraphWindowResponse | null;
  summary?: TraceSummary;
  maxImportance: number;
  traceId: string | null;
  onBack: () => void;
  onImportanceChange: (importance: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const max = Math.max(0, props.summary?.maxImportanceLevel ?? props.maxImportance);
  return (
    <header className="flow-toolbar">
      <div className="toolbar-title">
        <button className="back-button" onClick={props.onBack}>Back</button>
        <div>
          <h2>Node Graph</h2>
          <p className="trace-id-line">{props.traceId ?? "No trace selected"}</p>
          <p>
            {props.graph
              ? `${props.graph.metadata.returnedNodeCount}/${props.graph.metadata.totalNodeCount} nodes · ${props.graph.metadata.hiddenNodeCount} hidden · ${props.graph.metadata.ghostNodeCount} ghosts`
              : "Waiting for trace"}
          </p>
        </div>
      </div>
      <div className="toolbar-controls">
        <label>
          Importance ≤ {props.maxImportance}
          <input
            type="range"
            min={0}
            max={max}
            value={props.maxImportance}
            onChange={(event) => props.onImportanceChange(Number(event.currentTarget.value))}
          />
        </label>
        <button disabled={!props.graph?.metadata.hasBefore} onClick={props.onPrevious}>Prev</button>
        <button disabled={!props.graph?.metadata.hasAfter} onClick={props.onNext}>Next</button>
      </div>
    </header>
  );
}

function GraphView(props: {
  graph?: GraphWindowResponse | null;
  selectedId: string | null;
  onSelect: (item: ReadNode | GraphEdge) => void;
}) {
  const layout = useMemo(() => buildIndentedFlowLayout(props.graph), [props.graph]);
  const canvasRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    canvasRef.current?.scrollTo({ left: 0, top: 0 });
  }, [props.graph?.metadata.traceId, props.graph?.metadata.maxImportance, props.graph?.metadata.nextCursor]);

  if (!props.graph) return <div className="empty-canvas">Select materialized trace</div>;

  return (
    <section className="flow-canvas" ref={canvasRef}>
      <div className="flow-board" style={{ width: layout.width, height: layout.height }}>
        <svg className="flow-arrows" width={layout.width} height={layout.height}>
          <defs>
            <marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
            <marker id="flow-arrow-open" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
            <marker id="flow-arrow-ghost" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
          </defs>
          {layout.scopeLinks.map((link) => (
            <path key={link.id} className="scope-link" d={link.path} />
          ))}
          {layout.edges.map(({ edge, path, labelPosition }) => {
            const markerId = edge.isGhost ? "flow-arrow-ghost" : edge.status === "open" ? "flow-arrow-open" : "flow-arrow";
            return (
              <g key={edge.id} className={`flow-edge ${edge.status} ${edge.isGhost ? "ghost" : ""}`} onClick={() => props.onSelect(edge)}>
                <path d={path} markerEnd={`url(#${markerId})`} />
                <text x={labelPosition.x} y={labelPosition.y}>{edgeLabel(edge)}</text>
              </g>
            );
          })}
        </svg>

        {layout.nodes.map(({ node, position, extraIndent }) => (
          <button
            key={node.id}
            className={`flow-node ${node.status} ${node.isGhost ? "ghost" : ""} ${props.selectedId === node.id ? "selected" : ""}`}
            style={{ left: position.x, top: position.y }}
            onClick={() => props.onSelect(node)}
          >
            {layout.edgeChips.get(node.id)?.map((edge) => (
              <span key={edge.id} className={`edge-chip ${edge.status} ${edge.isGhost ? "ghost" : ""}`}>
                {edgeLabel(edge)}
              </span>
            ))}
            <span className="node-title">{node.name}</span>
            <span>
              column {Math.min(indentOf(node), MAX_VISUAL_INDENT)} · indent {indentOf(node)} · importance {importanceOf(node)}
              {extraIndent > 0 ? ` · +${extraIndent} deep` : ""}
            </span>
            <span>{formatDuration(node.durationMs)} · {formatTimeRange(node.startedAtUnixMs, node.endedAtUnixMs)}</span>
            {isGhostNode(node) && (
              <strong>{node.hiddenNodeCount} hidden · {node.hiddenErrorCount} errors · {formatDuration(node.hiddenDurationMs ?? null)}</strong>
            )}
            {node.diagnostics.length > 0 && <em>{node.diagnostics.length} diagnostics</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function Inspector(props: { item: ReadNode | GraphEdge | null; graph?: GraphWindowResponse | null }) {
  return (
    <aside className="inspector">
      <div className="section-title">Inspector</div>
      {!props.item && <div className="empty-state">Select node or edge</div>}
      {props.item && (
        <div className="inspector-body">
          <h3>{"fromNodeId" in props.item ? props.item.label : props.item.name}</h3>
          <dl>
            <dt>ID</dt>
            <dd>{props.item.id}</dd>
            <dt>Status</dt>
            <dd>{props.item.status}</dd>
            <dt>Duration</dt>
            <dd>{formatDuration(props.item.durationMs)}</dd>
            <dt>Started</dt>
            <dd>{formatTimestamp(props.item.startedAtUnixMs)}</dd>
            <dt>Ended</dt>
            <dd>{formatTimestamp(props.item.endedAtUnixMs)}</dd>
            <dt>Diagnostics</dt>
            <dd>{props.item.diagnostics.length ? props.item.diagnostics.join(", ") : "none"}</dd>
          </dl>
          <pre>{JSON.stringify("data" in props.item ? props.item.data : {}, null, 2)}</pre>
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

function buildIndentedFlowLayout(graph?: GraphWindowResponse | null) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const positions = new Map<string, { x: number; y: number }>();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgeChips = new Map<string, GraphEdge[]>();
  const laidOutNodes = nodes.map((node, index) => {
    const indent = indentOf(node);
    const visualIndent = Math.min(indent, MAX_VISUAL_INDENT);
    const position = {
      x: BOARD_PADDING + visualIndent * INDENT_GAP,
      y: BOARD_PADDING + index * FLOW_GAP,
    };
    positions.set(node.id, position);
    return {
      node,
      position,
      extraIndent: Math.max(0, indent - MAX_VISUAL_INDENT),
    };
  });

  const laidOutEdges = edges.flatMap((edge) => {
    const targetNode = nodesById.get(edge.toNodeId);
    if (targetNode?.parentId === edge.fromNodeId && edge.label === "continues") return [];

    const from = positions.get(edge.fromNodeId);
    const to = positions.get(edge.toNodeId);
    if (!from || !to) return [];
    if (to.x < from.x || to.y <= from.y) {
      const existing = edgeChips.get(edge.toNodeId) ?? [];
      existing.push(edge);
      edgeChips.set(edge.toNodeId, existing);
      return [];
    }

    const sameColumn = to.x === from.x;
    const x1 = sameColumn ? from.x + NODE_WIDTH / 2 : from.x + NODE_WIDTH;
    const y1 = sameColumn ? from.y + NODE_HEIGHT : from.y + NODE_HEIGHT / 2;
    const x2 = sameColumn ? to.x + NODE_WIDTH / 2 : to.x;
    const y2 = sameColumn ? to.y : to.y + NODE_HEIGHT / 2;
    const path = sameColumn
      ? `M ${x1} ${y1} C ${x1} ${y1 + 42}, ${x2} ${y2 - 42}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + 72} ${y1}, ${x2 - 72} ${y2}, ${x2} ${y2}`;

    return [{
      edge,
      path,
      labelPosition: {
        x: (x1 + x2) / 2,
        y: sameColumn ? (y1 + y2) / 2 - 8 : Math.min(y1, y2) - 10,
      },
    }];
  });

  const scopeLinks = nodes.flatMap((node) => {
    if (!node.parentId) return [];
    const parent = positions.get(node.parentId);
    const child = positions.get(node.id);
    if (!parent || !child) return [];

    const x1 = parent.x + NODE_WIDTH / 2;
    const y1 = parent.y + NODE_HEIGHT;
    const x2 = child.x + NODE_WIDTH / 2;
    const y2 = child.y;
    const verticalDrop = Math.max(28, Math.min(72, (y2 - y1) / 2));
    const path = x1 === x2
      ? `M ${x1} ${y1} C ${x1} ${y1 + verticalDrop}, ${x2} ${y2 - verticalDrop}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${y1 + verticalDrop}, ${x2} ${y2 - verticalDrop}, ${x2} ${y2}`;

    return [{ id: `scope:${node.parentId}:${node.id}`, path }];
  });

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    edgeChips,
    scopeLinks,
    width: Math.max(1100, BOARD_PADDING * 2 + (MAX_VISUAL_INDENT + 1) * INDENT_GAP + NODE_WIDTH),
    height: Math.max(680, BOARD_PADDING * 2 + Math.max(1, nodes.length) * FLOW_GAP + NODE_HEIGHT),
  };
}

function importanceOf(node: ReadNode): number {
  return Number.isFinite(node.importanceLevel) ? Math.max(0, Math.floor(node.importanceLevel)) : 0;
}

function indentOf(node: ReadNode): number {
  if (Number.isFinite(node.indentLevel)) return Math.max(0, Math.floor(node.indentLevel));
  return Array.isArray(node.ancestryPath) ? node.ancestryPath.length : 0;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "open";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function edgeLabel(edge: GraphEdge): string {
  if (edge.status === "open") return `${edge.label} · open`;
  return edge.label;
}

function isGhostNode(node: ReadNode): node is ReadNode & {
  isGhost: true;
  hiddenNodeCount: number;
  hiddenErrorCount: number;
  hiddenDurationMs: number | null;
} {
  return "isGhost" in node && node.isGhost === true;
}

function formatTimestamp(timestampMs: number | null): string {
  if (timestampMs === null) return "open";
  const date = new Date(timestampMs);
  return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function formatTimeRange(startMs: number | null, endMs: number | null): string {
  return `${formatTimestamp(startMs)} → ${formatTimestamp(endMs)}`;
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

function navigateToList(setRoute: (route: AppRoute) => void): void {
  window.history.pushState(null, "", "/");
  setRoute({ page: "list" });
}

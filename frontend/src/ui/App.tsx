import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchGraph, fetchTraces } from "../api";
import type { GraphEdge, GraphWindowResponse, ReadNode, TraceSummary } from "../types";

const NODE_WIDTH = 250;
const NODE_HEIGHT = 106;
const X_GAP = 330;
const Y_GAP = 148;

export function App() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [maxDepth, setMaxDepth] = useState(2);
  const [selectedItem, setSelectedItem] = useState<ReadNode | GraphEdge | null>(null);

  const tracesQuery = useQuery({ queryKey: ["traces"], queryFn: () => fetchTraces() });
  const activeTraceId = selectedTraceId ?? tracesQuery.data?.traces[0]?.traceId ?? null;
  const activeSummary = tracesQuery.data?.traces.find((trace) => trace.traceId === activeTraceId);

  const graphQuery = useQuery({
    queryKey: ["graph", activeTraceId, maxDepth, cursor],
    queryFn: () => fetchGraph({ traceId: activeTraceId!, maxDepth, cursor, limit: 250 }),
    enabled: Boolean(activeTraceId),
  });

  return (
    <div className="app-shell">
      <aside className="trace-sidebar">
        <div className="brand">
          <span className="brand-mark">TT</span>
          <div>
            <h1>Topo Tracer</h1>
            <p>Primitive node graph</p>
          </div>
        </div>
        <TraceList
          traces={tracesQuery.data?.traces ?? []}
          activeTraceId={activeTraceId}
          isLoading={tracesQuery.isLoading}
          onSelect={(traceId) => {
            setSelectedTraceId(traceId);
            setCursor(null);
            setSelectedItem(null);
          }}
        />
      </aside>

      <main className="graph-area">
        <GraphToolbar
          graph={graphQuery.data}
          summary={activeSummary}
          maxDepth={maxDepth}
          onDepthChange={(depth) => {
            setMaxDepth(depth);
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
          <span>{trace.nodeCount} nodes · max depth {trace.maxDepth}</span>
        </button>
      ))}
    </div>
  );
}

function GraphToolbar(props: {
  graph?: GraphWindowResponse | null;
  summary?: TraceSummary;
  maxDepth: number;
  onDepthChange: (depth: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const max = Math.max(0, props.summary?.maxDepth ?? props.maxDepth);
  return (
    <header className="flow-toolbar">
      <div>
        <h2>Node Graph</h2>
        <p>
          {props.graph
            ? `${props.graph.metadata.returnedNodeCount}/${props.graph.metadata.totalNodeCount} nodes · ${props.graph.metadata.hiddenNodeCount} hidden · ${props.graph.metadata.ghostNodeCount} ghosts`
            : "Waiting for trace"}
        </p>
      </div>
      <div className="toolbar-controls">
        <label>
          Depth {props.maxDepth}
          <input
            type="range"
            min={0}
            max={max}
            value={props.maxDepth}
            onChange={(event) => props.onDepthChange(Number(event.currentTarget.value))}
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
  const layout = useMemo(() => buildLayout(props.graph), [props.graph]);

  if (!props.graph) return <div className="empty-canvas">Select materialized trace</div>;

  return (
    <section className="graph-canvas">
      <div className="graph-board" style={{ width: layout.width, height: layout.height }}>
        <svg className="graph-arrows" width={layout.width} height={layout.height}>
          <defs>
            <marker id="graph-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
          </defs>
          {props.graph.edges.map((edge) => {
            const from = layout.positions.get(edge.fromNodeId);
            const to = layout.positions.get(edge.toNodeId);
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_HEIGHT / 2;
            const curve = Math.max(90, Math.abs(x2 - x1) / 2);
            const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
            return (
              <g key={edge.id} className={`graph-edge ${edge.status} ${edge.isGhost ? "ghost" : ""}`} onClick={() => props.onSelect(edge)}>
                <path d={path} markerEnd="url(#graph-arrow)" />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}>{edge.label}</text>
              </g>
            );
          })}
        </svg>

        {props.graph.nodes.map((node) => {
          const position = layout.positions.get(node.id)!;
          return (
            <button
              key={node.id}
              className={`graph-node ${node.status} ${node.isGhost ? "ghost" : ""} ${props.selectedId === node.id ? "selected" : ""}`}
              style={{ left: position.x, top: position.y }}
              onClick={() => props.onSelect(node)}
            >
              <span className="node-title">{node.name}</span>
              <span>depth {node.depth} · {formatDuration(node.durationMs)}</span>
              {node.isGhost && <strong>{node.hiddenNodeCount} hidden · {node.hiddenErrorCount} errors</strong>}
              {node.diagnostics.length > 0 && <em>{node.diagnostics.length} diagnostics</em>}
            </button>
          );
        })}
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
          <span>{props.graph.summary.maxDepth} max depth</span>
        </div>
      )}
    </aside>
  );
}

function buildLayout(graph?: GraphWindowResponse | null) {
  const positions = new Map<string, { x: number; y: number }>();
  const nodes = graph?.nodes ?? [];

  nodes.forEach((node, index) => {
    positions.set(node.id, {
      x: 40 + node.depth * X_GAP,
      y: 40 + index * Y_GAP,
    });
  });

  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  return {
    positions,
    width: Math.max(1000, 120 + (maxDepth + 1) * X_GAP),
    height: Math.max(640, 120 + nodes.length * Y_GAP),
  };
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "open";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

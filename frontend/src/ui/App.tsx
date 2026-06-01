import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchFlowWindow, fetchTraces } from "../api";
import type { FlowWindowResponse, ReadContainer, ReadEdge, ReadNode, TraceSummary } from "../types";

export function App() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReadNode | ReadEdge | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const tracesQuery = useQuery({
    queryKey: ["traces"],
    queryFn: () => fetchTraces(),
  });

  const activeTraceId = selectedTraceId ?? tracesQuery.data?.traces[0]?.traceId ?? null;

  const flowQuery = useQuery({
    queryKey: ["flow-window", activeTraceId, cursor, expandedIds],
    queryFn: () => fetchFlowWindow({
      traceId: activeTraceId!,
      cursor,
      expandedIds,
      detailBudget: 250,
    }),
    enabled: Boolean(activeTraceId),
  });

  const flow = flowQuery.data;

  return (
    <div className="app-shell">
      <aside className="trace-sidebar">
        <div className="brand">
          <span className="brand-mark">TT</span>
          <div>
            <h1>Topo Tracer</h1>
            <p>Causal flow map</p>
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
            setExpandedIds([]);
          }}
        />
      </aside>

      <main className="flow-area">
        <FlowToolbar
          flow={flow}
          isLoading={flowQuery.isFetching}
          onLoadBefore={() => setCursor(flow?.metadata.previousCursor ?? null)}
          onLoadAfter={() => setCursor(flow?.metadata.nextCursor ?? null)}
        />
        <FlowView
          flow={flow}
          selectedId={selectedItem?.id ?? null}
          onSelect={setSelectedItem}
          onToggleExpand={(id) => {
            setExpandedIds((current) =>
              current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
            );
          }}
        />
      </main>

      <Inspector item={selectedItem} flow={flow} />
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
      {!props.isLoading && props.traces.length === 0 && (
        <div className="empty-state">No materialized traces yet</div>
      )}
      {props.traces.map((trace) => (
        <button
          key={trace.traceId}
          className={`trace-row ${trace.traceId === props.activeTraceId ? "active" : ""}`}
          onClick={() => props.onSelect(trace.traceId)}
        >
          <span className="trace-id">{trace.traceId}</span>
          <span>{trace.nodeCount} nodes · {trace.edgeCount} edges</span>
        </button>
      ))}
    </div>
  );
}

function FlowToolbar(props: {
  flow?: FlowWindowResponse | null;
  isLoading: boolean;
  onLoadBefore: () => void;
  onLoadAfter: () => void;
}) {
  const meta = props.flow?.metadata;
  return (
    <header className="flow-toolbar">
      <div>
        <h2>Adaptive Causal Swimlane</h2>
        <p>
          {meta
            ? `${meta.returnedNodeCount}/${meta.totalNodeCount} nodes · ${meta.omittedNodeCount} hidden`
            : "Waiting for trace"}
        </p>
      </div>
      <div className="toolbar-actions">
        <button disabled={!meta?.hasMoreBefore || props.isLoading} onClick={props.onLoadBefore}>
          Load before
        </button>
        <button disabled={!meta?.hasMoreAfter || props.isLoading} onClick={props.onLoadAfter}>
          Load after
        </button>
      </div>
    </header>
  );
}

function FlowView(props: {
  flow?: FlowWindowResponse | null;
  selectedId: string | null;
  onSelect: (item: ReadNode | ReadEdge) => void;
  onToggleExpand: (id: string) => void;
}) {
  const laneModel = useMemo(() => buildLaneModel(props.flow), [props.flow]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [arrows, setArrows] = useState<FlowArrow[]>([]);

  useLayoutEffect(() => {
    if (!props.flow || !contentRef.current) return;

    const updateArrows = () => {
      const contentRect = contentRef.current!.getBoundingClientRect();
      const nextArrows = props.flow!.edges
        .map((edge) => {
          const fromEl = nodeRefs.current.get(edge.fromId);
          const toEl = nodeRefs.current.get(edge.toId);
          if (!fromEl || !toEl) return null;

          const from = fromEl.getBoundingClientRect();
          const to = toEl.getBoundingClientRect();
          const fromCenterX = from.left - contentRect.left + from.width / 2;
          const fromCenterY = from.top - contentRect.top + from.height / 2;
          const toCenterX = to.left - contentRect.left + to.width / 2;
          const toCenterY = to.top - contentRect.top + to.height / 2;
          const sameLane = Math.abs(fromCenterX - toCenterX) < 80;

          if (sameLane) {
            const x = fromCenterX;
            const y1 = from.bottom - contentRect.top + 4;
            const y2 = to.top - contentRect.top - 4;
            return {
              id: edge.id,
              kind: edge.kind,
              status: edge.status,
              path: `M ${x} ${y1} L ${x} ${y2}`,
              labelX: x + 12,
              labelY: y1 + Math.max(18, (y2 - y1) / 2),
            };
          }

          const startX = from.right - contentRect.left + 6;
          const startY = fromCenterY;
          const endX = to.left - contentRect.left - 8;
          const endY = toCenterY;
          const curve = Math.max(80, Math.abs(endX - startX) / 2);
          return {
            id: edge.id,
            kind: edge.kind,
            status: edge.status,
            path: `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`,
            labelX: (startX + endX) / 2,
            labelY: (startY + endY) / 2 - 8,
          };
        })
        .filter((arrow): arrow is FlowArrow => Boolean(arrow));

      setArrows(nextArrows);
    };

    updateArrows();
    const resizeObserver = new ResizeObserver(updateArrows);
    resizeObserver.observe(contentRef.current);
    window.addEventListener("resize", updateArrows);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateArrows);
    };
  }, [props.flow, laneModel]);

  if (!props.flow) {
    return <div className="empty-canvas">Select a trace after materialization finishes</div>;
  }

  return (
    <section className="flow-canvas">
      <div ref={contentRef} className="flow-content">
        <svg
          className="flow-arrows"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <defs>
            <marker id="arrow-ok" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
            <marker id="arrow-open" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
          </defs>
          {arrows.map((arrow) => (
            <g key={arrow.id} className={`flow-arrow ${arrow.status}`}>
              <path d={arrow.path} markerEnd={`url(#${arrow.status === "open" ? "arrow-open" : "arrow-ok"})`} />
            </g>
          ))}
        </svg>
        <div
          className="lane-grid causal-grid"
          style={{ gridTemplateColumns: `repeat(${laneModel.lanes.length}, minmax(260px, 1fr))` }}
        >
          {laneModel.lanes.map((lane, laneIndex) => (
            <div
              key={lane.container.id}
              className="lane lane-header-card"
              style={{ gridColumn: laneIndex + 1, gridRow: 1 }}
            >
              <div className="lane-header">
                <strong>{lane.container.name}</strong>
                <span>{lane.container.kind}</span>
              </div>
            </div>
          ))}
          {laneModel.orderedNodes.map((node, nodeIndex) => {
            const outgoing = props.flow!.edges.filter((edge) => edge.fromId === node.id);
            const laneIndex = laneModel.laneIndexByContainer.get(node.containerId ?? "") ?? 0;
            return (
              <article
                key={node.id}
                ref={(element) => {
                  if (element) nodeRefs.current.set(node.id, element);
                  else nodeRefs.current.delete(node.id);
                }}
                className={`flow-node ${node.status} ${props.selectedId === node.id ? "selected" : ""}`}
                style={{ gridColumn: laneIndex + 1, gridRow: nodeIndex + 2 }}
                onClick={() => props.onSelect(node)}
              >
                <div className="node-topline">
                  <button
                    title="Expand local detail"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onToggleExpand(node.id);
                    }}
                  >
                    +
                  </button>
                  <strong>{node.name}</strong>
                  <span>{formatDuration(node.durationMs)}</span>
                </div>
                <div className="node-meta">
                  <span>{node.kind}</span>
                  {node.diagnostics.length > 0 && <span>{node.diagnostics.length} warnings</span>}
                </div>
                {outgoing.length > 0 && (
                  <div className="edge-list">
                    {outgoing.map((edge) => (
                      <button
                        key={edge.id}
                        className={`edge-chip ${edge.status}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onSelect(edge);
                        }}
                      >
                        <span>{edge.kind}</span>
                        <strong>{laneModel.nodeNames.get(edge.toId) ?? edge.toId}</strong>
                        <em>{laneModel.nodeContainerNames.get(edge.toId) ?? "unknown lane"}</em>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {props.flow.metadata.omittedNodeCount > 0 && (
        <div className="omitted-banner">
          {props.flow.metadata.omittedNodeCount} nodes and {props.flow.metadata.omittedEdgeCount} edges omitted by safety cap.
        </div>
      )}
    </section>
  );
}

type FlowArrow = {
  id: string;
  kind: string;
  status: string;
  path: string;
  labelX: number;
  labelY: number;
};

function Inspector(props: { item: ReadNode | ReadEdge | null; flow?: FlowWindowResponse | null }) {
  return (
    <aside className="inspector">
      <div className="section-title">Inspector</div>
      {!props.item && <div className="empty-state">Select a node or edge</div>}
      {props.item && (
        <div className="inspector-body">
          <h3>{itemTitle(props.item)}</h3>
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
          <pre>{JSON.stringify(props.item.metadata, null, 2)}</pre>
        </div>
      )}
      {props.flow && (
        <div className="summary-strip">
          <span>{props.flow.summary.containerCount} containers</span>
          <span>{props.flow.summary.errorCount} errors</span>
          <span>{props.flow.summary.diagnosticCount} diagnostics</span>
        </div>
      )}
    </aside>
  );
}

function buildLaneModel(flow?: FlowWindowResponse | null) {
  const containers = flow?.containers.length
    ? flow.containers
    : [{
      id: "unknown",
      traceId: flow?.metadata.traceId ?? "",
      parentId: null,
      name: "Unassigned",
      kind: "container",
      status: "open",
      startedAtUnixMs: null,
      endedAtUnixMs: null,
      durationMs: null,
      ancestryIds: [],
      diagnostics: [],
      metadata: {},
    } satisfies ReadContainer];
  const byContainer = new Map(containers.map((container) => [container.id, {
    container,
    nodes: [] as ReadNode[],
  }]));
  const fallback = byContainer.values().next().value!;
  const nodeNames = new Map<string, string>();
  const nodeContainerNames = new Map<string, string>();

  for (const node of flow?.nodes ?? []) {
    nodeNames.set(node.id, node.name);
    const lane = node.containerId ? byContainer.get(node.containerId) : null;
    (lane ?? fallback).nodes.push(node);
    nodeContainerNames.set(node.id, (lane ?? fallback).container.name);
  }

  const lanes = Array.from(byContainer.values()).filter((lane) => lane.nodes.length > 0);

  return {
    lanes,
    laneIndexByContainer: new Map(lanes.map((lane, index) => [lane.container.id, index])),
    orderedNodes: (flow?.nodes ?? []).slice().sort((a, b) => a.flowOrder - b.flowOrder),
    nodeContainerNames,
    nodeNames,
  };
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "open";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function itemTitle(item: ReadNode | ReadEdge): string {
  return "fromId" in item ? `${item.kind} edge` : item.name;
}

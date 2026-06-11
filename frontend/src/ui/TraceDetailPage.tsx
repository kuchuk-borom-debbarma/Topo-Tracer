import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
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
import { memo, useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import { fetchTraceFlow, fetchTraceSummary, fetchTraces } from "../api";
import type {
  ProjectedFlowEdge,
  ProjectedFlowNode,
  ProjectedFlowResult,
  ProjectedGhostNode,
  ProjectedNormalNode,
  TraceSummary,
} from "../types";
import {
  diagnosticCount,
  formatCompactNumber,
  formatDate,
  formatDuration,
  formatTime,
  nodeLabel,
  shortId,
} from "../utils";
import { Icon } from "./Icon";

const NODE_WIDTH = 252;
const NODE_HEIGHT = 112;
const COLUMN_GAP = 330;
const ROW_GAP = 156;

type SelectedItem =
  | { type: "node"; value: ProjectedFlowNode }
  | { type: "edge"; value: ProjectedFlowEdge };
type FlowNodeData = { value: ProjectedFlowNode };
type TraceFlowNode = Node<FlowNodeData, "trace-node">;
type TraceFlowEdge = Edge<{ value: ProjectedFlowEdge }>;

export function TraceDetailPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { traceId: string };
  const search = useSearch({ strict: false }) as {
    threshold?: number;
    cursor?: string;
  };
  const traceId = params.traceId;
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["trace-summary", traceId],
    queryFn: () => fetchTraceSummary(traceId),
  });
  const summary = summaryQuery.data;
  const threshold = normalizeThreshold(
    search.threshold,
    summary?.minImportanceLevel ?? 0,
    summary?.maxImportanceLevel ?? 9,
  );
  const flowQuery = useQuery({
    queryKey: ["trace-flow", traceId, threshold, search.cursor],
    queryFn: () => fetchTraceFlow({
      traceId,
      threshold,
      cursor: search.cursor,
      limit: 160,
    }),
  });
  const nearbyQuery = useQuery({
    queryKey: ["traces", 1, 10],
    queryFn: () => fetchTraces({ page: 1, limit: 10 }),
  });

  useEffect(() => {
    setSelected(null);
  }, [traceId, threshold, search.cursor]);

  const updateSearch = (next: { threshold?: number; cursor?: string }) => {
    navigate({
      to: "/traces/$traceId",
      params: { traceId },
      search: {
        threshold: next.threshold ?? threshold,
        cursor: next.cursor,
      },
      replace: true,
    });
  };

  return (
    <main className="trace-detail-page">
      <header className="detail-topbar">
        <div className="detail-breadcrumb">
          <Link to="/traces" search={{ page: 1 }} className="back-link">
            <Icon name="arrow-left" />
          </Link>
          <div>
            <span className="overline">Trace detail</span>
            <h1 title={traceId}>{shortId(traceId, 28)}</h1>
          </div>
          <span className={`status-pill ${summary?.endedAt === null ? "running" : "complete"}`}>
            <span />
            {summary?.endedAt === null ? "Running" : "Materialized"}
          </span>
        </div>
        <div className="detail-actions">
          <button
            className="button secondary"
            onClick={() => {
              summaryQuery.refetch();
              flowQuery.refetch();
            }}
            disabled={flowQuery.isFetching}
          >
            <Icon name="refresh" className={flowQuery.isFetching ? "spinning" : ""} />
            Refresh
          </button>
          <button className="icon-button outlined" aria-label="Open trace externally">
            <Icon name="external" />
          </button>
        </div>
      </header>

      <section className="detail-layout">
        <aside className="trace-context-rail">
          <div className="context-heading">
            <span>Recent traces</span>
            <Link to="/traces" search={{ page: 1 }}>View all</Link>
          </div>
          <div className="context-list">
            {nearbyQuery.data?.traces.map((trace) => (
              <Link
                key={trace.traceId}
                to="/traces/$traceId"
                params={{ traceId: trace.traceId }}
                search={{ threshold: trace.minImportanceLevel, cursor: undefined }}
                className={`context-trace ${trace.traceId === traceId ? "active" : ""}`}
              >
                <span className="context-line" />
                <span>
                  <strong>{shortId(trace.traceId, 14)}</strong>
                  <small>{formatCompactNumber(trace.nodeCount)} nodes</small>
                </span>
                <i className={trace.endedAt === null ? "running" : ""} />
              </Link>
            ))}
          </div>
          <div className="context-summary">
            <span className="overline">Current window</span>
            <SummaryMiniRow label="Flow order" value={
              flowQuery.data
                ? `${flowQuery.data.metadata.paging.fromFlowOrder}-${flowQuery.data.metadata.paging.toFlowOrder}`
                : "-"
            } />
            <SummaryMiniRow
              label="Visible"
              value={String(flowQuery.data?.metadata.visibleNodeCount ?? 0)}
            />
            <SummaryMiniRow
              label="Collapsed"
              value={String(flowQuery.data?.metadata.ghostNodeCount ?? 0)}
            />
          </div>
        </aside>

        <section className="graph-stage">
          <GraphToolbar
            summary={summary}
            flow={flowQuery.data}
            threshold={threshold}
            onThresholdChange={(value) => updateSearch({ threshold: value })}
          />

          <div className="graph-frame">
            {flowQuery.isLoading && <GraphLoading />}
            {flowQuery.isError && (
              <div className="graph-empty">
                <div className="empty-icon"><Icon name="terminal" /></div>
                <h3>Projection unavailable</h3>
                <p>The bounded graph window could not be loaded.</p>
                <button className="button primary" onClick={() => flowQuery.refetch()}>Retry</button>
              </div>
            )}
            {flowQuery.data && (
              <TraceCanvas
                flow={flowQuery.data}
                selected={selected}
                onSelect={setSelected}
              />
            )}

            {flowQuery.data && (
              <div className="window-pagination floating-panel">
                <button
                  onClick={() => updateSearch({
                    threshold,
                    cursor: flowQuery.data.metadata.paging.previousCursor ?? undefined,
                  })}
                  disabled={!flowQuery.data.metadata.paging.hasBefore}
                  aria-label="Previous graph window"
                >
                  <Icon name="arrow-left" />
                </button>
                <span>
                  Nodes {flowQuery.data.metadata.paging.fromFlowOrder}-
                  {flowQuery.data.metadata.paging.toFlowOrder}
                  <small>of {formatCompactNumber(flowQuery.data.metadata.paging.totalNodeCount)}</small>
                </span>
                <button
                  onClick={() => updateSearch({
                    threshold,
                    cursor: flowQuery.data.metadata.paging.nextCursor ?? undefined,
                  })}
                  disabled={!flowQuery.data.metadata.paging.hasAfter}
                  aria-label="Next graph window"
                >
                  <Icon name="arrow-right" />
                </button>
              </div>
            )}
          </div>
        </section>

        <Inspector
          selected={selected}
          summary={summary}
          onClose={() => setSelected(null)}
        />
      </section>
    </main>
  );
}

function GraphToolbar(props: {
  summary?: TraceSummary;
  flow?: ProjectedFlowResult;
  threshold: number;
  onThresholdChange: (value: number) => void;
}) {
  const min = props.summary?.minImportanceLevel ?? 0;
  const max = Math.max(min, props.summary?.maxImportanceLevel ?? 9);
  const percentage = max === min ? 100 : ((props.threshold - min) / (max - min)) * 100;

  return (
    <div className="graph-toolbar">
      <div className="graph-stats">
        <GraphStat
          label="Nodes"
          value={`${props.flow?.metadata.returnedNodeCount ?? 0}`}
          detail={`/ ${formatCompactNumber(props.summary?.nodeCount ?? 0)}`}
        />
        <GraphStat
          label="Edges"
          value={`${props.flow?.metadata.returnedEdgeCount ?? 0}`}
          detail={`/ ${formatCompactNumber(props.summary?.edgeCount ?? 0)}`}
        />
        <GraphStat
          label="Duration"
          value={props.summary ? formatDuration(props.summary.startedAt, props.summary.endedAt) : "-"}
        />
        <GraphStat
          label="Diagnostics"
          value={`${props.summary ? diagnosticCount(props.summary) : 0}`}
          alert={Boolean(props.summary && diagnosticCount(props.summary))}
        />
      </div>

      <div className="importance-control">
        <div className="importance-heading">
          <span><Icon name="filter" /> Importance threshold</span>
          <strong>I{props.threshold}</strong>
        </div>
        <div className="slider-row">
          <span>I{min}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={props.threshold}
            style={{ "--slider-progress": `${percentage}%` } as React.CSSProperties}
            onChange={(event) => props.onThresholdChange(Number(event.target.value))}
          />
          <span>I{max}</span>
        </div>
        <small>Shows nodes where importance is less than or equal to I{props.threshold}</small>
      </div>
    </div>
  );
}

function GraphStat(props: {
  label: string;
  value: string;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <div className="graph-stat">
      <span>{props.label}</span>
      <strong className={props.alert ? "alert" : ""}>
        {props.value} <small>{props.detail}</small>
      </strong>
    </div>
  );
}

function TraceCanvas(props: {
  flow: ProjectedFlowResult;
  selected: SelectedItem | null;
  onSelect: (selected: SelectedItem | null) => void;
}) {
  const graph = useMemo(
    () => buildFlow(props.flow, props.selected),
    [props.flow, props.selected],
  );

  if (props.flow.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="empty-icon"><Icon name="graph" /></div>
        <h3>No nodes in this window</h3>
        <p>Move the importance threshold or navigate to another window.</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
      minZoom={0.18}
      maxZoom={1.7}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => props.onSelect(null)}
      onNodeClick={(_, node) => {
        const value = graph.nodeById.get(node.id);
        if (value) props.onSelect({ type: "node", value });
      }}
      onEdgeClick={(_, edge) => {
        const value = graph.edgeById.get(edge.id);
        if (value) props.onSelect({ type: "edge", value });
      }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.15}
        color="#d6dce8"
      />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => String(node.style?.backgroundColor ?? "#6d5dfc")}
        maskColor="rgba(244, 247, 251, 0.72)"
      />
    </ReactFlow>
  );
}

const TraceNodeCard = memo(function TraceNodeCard(props: NodeProps<TraceFlowNode>) {
  const node = props.data.value;
  if (node.kind === "ghost") {
    return (
      <div className={`trace-node-card ghost ${props.selected ? "selected" : ""}`}>
        <Handle type="target" position={Position.Left} />
        <div className="node-card-top">
          <span className="node-kind-icon ghost"><Icon name="layers" /></span>
          <span>Collapsed subflow</span>
          <strong>I{node.minImportanceLevel}-I{node.maxImportanceLevel}</strong>
        </div>
        <h3>{node.hiddenNodeCount} hidden nodes</h3>
        <p>{summarizeTypes(node.nodeTypeCounts)}</p>
        <div className="node-card-footer">
          <span>{node.hiddenEdgeCount} internal edges</span>
          <span>#{node.flowOrderStart}-{node.flowOrderEnd}</span>
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div className={`trace-node-card ${props.selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-card-top">
        <span className={`node-kind-icon importance-${Math.min(node.importanceLevel, 4)}`}>
          <Icon name={node.nodeType.toLowerCase().includes("db") ? "database" : "activity"} />
        </span>
        <span>{node.nodeType}</span>
        <strong>I{node.importanceLevel}</strong>
      </div>
      <h3>{nodeLabel(node.nodeType, node.data)}</h3>
      <p>{formatTime(node.startedAt)} to {formatTime(node.endedAt)}</p>
      <div className="node-card-footer">
        <span>{formatDuration(node.startedAt, node.endedAt)}</span>
        <span>#{node.flowOrder}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = { "trace-node": TraceNodeCard };

function Inspector(props: {
  selected: SelectedItem | null;
  summary?: TraceSummary;
  onClose: () => void;
}) {
  if (!props.selected) return null;

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <button className="icon-button" onClick={props.onClose} aria-label="Close inspector">
          <Icon name="x" />
        </button>
      </div>

      {props.selected.type === "node" && <NodeInspector node={props.selected.value} />}
      {props.selected.type === "edge" && <EdgeInspector edge={props.selected.value} />}
    </aside>
  );
}

function NodeInspector({ node }: { node: ProjectedFlowNode }) {
  if (node.kind === "ghost") {
    return (
      <>
        <div className="inspector-badge"><Icon name="layers" /> Aggregated hidden detail</div>
        <div className="inspector-section">
          <DetailRow label="Hidden nodes" value={String(node.hiddenNodeCount)} />
          <DetailRow label="Internal edges" value={String(node.hiddenEdgeCount)} />
          <DetailRow label="Flow range" value={`${node.flowOrderStart}-${node.flowOrderEnd}`} />
          <DetailRow label="Importance" value={`I${node.minImportanceLevel}-I${node.maxImportanceLevel}`} />
          <DetailRow label="Duration" value={formatDuration(node.startedAt, node.endedAt)} />
        </div>
        <DataBlock data={node.nodeTypeCounts} title="Node types" />
      </>
    );
  }
  return (
    <>
      <div className="inspector-badge"><Icon name="activity" /> {node.nodeType}</div>
      <div className="inspector-section">
        <DetailRow label="Node ID" value={node.id} mono />
        <DetailRow label="Importance" value={`I${node.importanceLevel}`} />
        <DetailRow label="Flow order" value={String(node.flowOrder)} />
        <DetailRow label="Started" value={formatDate(node.startedAt)} />
        <DetailRow label="Duration" value={formatDuration(node.startedAt, node.endedAt)} />
        <DetailRow label="Clock skew" value={`${node.clockSkewMs} ms`} />
      </div>
      <DataBlock data={node.data} title="Attributes" />
    </>
  );
}

function EdgeInspector({ edge }: { edge: ProjectedFlowEdge }) {
  return (
    <>
      <div className="inspector-badge"><Icon name="arrow-right" /> {edge.edgeType}</div>
      <div className="inspector-section">
        <DetailRow label="Edge ID" value={edge.id} mono />
        <DetailRow label="From" value={edge.fromNodeId} mono />
        <DetailRow label="To" value={edge.toNodeId} mono />
        <DetailRow label="Edge count" value={String(edge.edgeCount)} />
        <DetailRow label="Duration" value={formatDuration(edge.startedAt, edge.endedAt)} />
        <DetailRow label="Clock skew" value={`${edge.clockSkewMs} ms`} />
      </div>
    </>
  );
}

function DataBlock(props: { data: Record<string, string | number>; title: string }) {
  const entries = Object.entries(props.data);
  return (
    <div className="inspector-section">
      <h3>{props.title} <span>{entries.length}</span></h3>
      {entries.length === 0
        ? <p className="muted-copy">No attributes recorded.</p>
        : <div className="data-block">
          {entries.map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <code>{String(value)}</code>
            </div>
          ))}
        </div>}
    </div>
  );
}

function DetailRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail-row">
      <span>{props.label}</span>
      <strong className={props.mono ? "mono" : ""} title={props.value}>{props.value}</strong>
    </div>
  );
}

function SummaryMiniRow(props: { label: string; value: string }) {
  return <div><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function GraphLoading() {
  return (
    <div className="graph-loading">
      <div className="loading-node one" />
      <div className="loading-node two" />
      <div className="loading-node three" />
      <div className="loading-line line-one" />
      <div className="loading-line line-two" />
    </div>
  );
}

function buildFlow(flow: ProjectedFlowResult, selected: SelectedItem | null): {
  nodes: TraceFlowNode[];
  edges: TraceFlowEdge[];
  nodeById: Map<string, ProjectedFlowNode>;
  edgeById: Map<string, ProjectedFlowEdge>;
} {
  const orderedNodes = [...flow.nodes].sort(compareFlowNodes);
  const nodeById = new Map(orderedNodes.map((node) => [node.id, node]));
  const edgeById = new Map(flow.edges.map((edge) => [edge.id, edge]));
  const positions = layoutGraph(orderedNodes, flow.edges);
  const selectedId = selected?.value.id;

  const nodes = orderedNodes.map<TraceFlowNode>((node) => ({
    id: node.id,
    type: "trace-node",
    data: { value: node },
    position: positions.get(node.id) ?? { x: 80, y: 80 },
    selected: selected?.type === "node" && selectedId === node.id,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      width: NODE_WIDTH,
      backgroundColor: node.kind === "ghost" ? "#eef1f7" : nodeColor(node),
      "--node-color": node.kind === "ghost" ? "#8d97a7" : nodeColor(node),
    } as React.CSSProperties,
  }));

  const edges = flow.edges
    .filter((edge) => nodeById.has(edge.fromNodeId) && nodeById.has(edge.toNodeId))
    .map<TraceFlowEdge>((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      data: { value: edge },
      label: edge.edgeCount > 1 ? `${edge.edgeType} x${edge.edgeCount}` : edge.edgeType,
      selected: selected?.type === "edge" && selectedId === edge.id,
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: selectedId === edge.id ? "#5b4ff1" : "#98a2b3",
        width: 17,
        height: 17,
      },
      style: {
        stroke: selectedId === edge.id ? "#5b4ff1" : "#98a2b3",
        strokeWidth: selectedId === edge.id ? 2.8 : 1.7,
      },
      labelStyle: { fill: "#667085", fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: "#f8f9fc", fillOpacity: 0.94 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 5,
    }));

  return { nodes, edges, nodeById, edgeById };
}

function layoutGraph(
  nodes: ProjectedFlowNode[],
  edges: ProjectedFlowEdge[],
): Map<string, { x: number; y: number }> {
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (!nodeById.has(edge.fromNodeId) || !nodeById.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  }

  const indegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)?.length ?? 0]));
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort(compareFlowNodes)
    .map((node) => node.id);
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const child of outgoing.get(id) ?? []) {
      rank.set(child, Math.max(rank.get(child) ?? 0, (rank.get(id) ?? 0) + 1));
      indegree.set(child, (indegree.get(child) ?? 1) - 1);
      if ((indegree.get(child) ?? 0) === 0) queue.push(child);
    }
  }

  let fallbackRank = Math.max(0, ...rank.values());
  for (const node of nodes) {
    if (!visited.has(node.id)) rank.set(node.id, ++fallbackRank);
  }

  const uniqueRanks = Array.from(new Set(rank.values())).sort((a, b) => a - b);
  const compressed = new Map(uniqueRanks.map((value, index) => [value, index]));
  const columns = new Map<number, ProjectedFlowNode[]>();
  for (const node of nodes) {
    const column = compressed.get(rank.get(node.id) ?? 0) ?? 0;
    const bucket = columns.get(column) ?? [];
    bucket.push(node);
    columns.set(column, bucket);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [column, bucket] of columns) {
    bucket.sort(compareFlowNodes);
    const band = Math.floor(column / 2);
    const slot = column % 2;
    const displayColumn = band % 2 === 0 ? slot : 1 - slot;
    bucket.forEach((node, row) => {
      positions.set(node.id, {
        x: 72 + displayColumn * COLUMN_GAP,
        y: 64 + (band + row) * ROW_GAP,
      });
    });
  }
  return positions;
}

function compareFlowNodes(a: ProjectedFlowNode, b: ProjectedFlowNode): number {
  return flowOrder(a) - flowOrder(b) || a.id.localeCompare(b.id);
}

function flowOrder(node: ProjectedFlowNode): number {
  return node.kind === "normal" ? node.flowOrder : node.flowOrderStart;
}

function nodeColor(node: ProjectedNormalNode): string {
  const colors = ["#14b8a6", "#4f7cff", "#7c5ce7", "#c365d8", "#dd7d3f"];
  return colors[Math.min(Math.max(node.importanceLevel, 0), colors.length - 1)];
}

function selectedTitle(selected: SelectedItem): string {
  if (selected.type === "edge") return selected.value.edgeType;
  if (selected.value.kind === "ghost") return "Collapsed subflow";
  return nodeLabel(selected.value.nodeType, selected.value.data);
}

function summarizeTypes(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "Mixed node types";
  return entries.slice(0, 2).map(([type, count]) => `${count} ${type}`).join(" / ");
}

function normalizeThreshold(
  value: number | undefined,
  min: number,
  max: number,
): number {
  const candidate = Number.isFinite(value) ? Math.floor(value!) : min;
  return Math.min(max, Math.max(min, candidate));
}

function buildDiagnostics(summary: TraceSummary): { label: string; value: number }[] {
  return [
    { label: "Missing starts", value: summary.diagMissingStarts },
    { label: "Missing ends", value: summary.diagMissingEnds },
    { label: "Negative durations", value: summary.diagNegativeDurations },
    { label: "Cycles", value: summary.diagCycles },
    { label: "Orphan edges", value: summary.diagOrphanEdges },
    { label: "Invalid importance", value: summary.diagInvalidImportance },
    { label: "Clock skew", value: summary.diagClockSkew },
    { label: "Limit exceeded", value: summary.diagLimitExceeded },
  ].filter((item) => item.value > 0);
}

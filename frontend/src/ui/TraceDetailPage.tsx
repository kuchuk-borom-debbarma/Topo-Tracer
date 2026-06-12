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
import type { ReactNode } from "react";
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
  formatImportance,
  formatTime,
  nodeLabel,
  shortId,
} from "../utils";
import { Icon } from "./Icon";

const NODE_WIDTH = 250;
const NODE_HEIGHT = 104;
const COLUMN_GAP = 310;
const ROW_GAP = 132;

type SelectedItem =
  | { type: "node"; value: ProjectedFlowNode }
  | { type: "edge"; value: ProjectedFlowEdge };

type FlowNodeData = {
  value: ProjectedFlowNode;
  importanceLabels?: Record<number, string>;
  selected: boolean;
};

type TraceFlowNode = Node<FlowNodeData, "trace-node">;
type TraceFlowEdge = Edge<{ value: ProjectedFlowEdge }>;

export function TraceDetailPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { traceId: string };
  const search = useSearch({ strict: false }) as { threshold?: number; cursor?: string };
  const traceId = params.traceId;
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["trace-summary", traceId],
    queryFn: () => fetchTraceSummary(traceId),
    retry: false,
  });
  const summary = summaryQuery.data;
  const threshold = normalizeThreshold(
    search.threshold,
    summary?.minImportanceLevel ?? 0,
    summary?.maxImportanceLevel ?? 9,
  );

  const flowQuery = useQuery({
    queryKey: ["trace-flow", traceId, threshold, search.cursor],
    queryFn: () => fetchTraceFlow({ traceId, threshold, cursor: search.cursor, limit: 180 }),
    enabled: Boolean(traceId) && !summaryQuery.isError,
    retry: false,
  });

  const nearbyQuery = useQuery({
    queryKey: ["traces", 1, 8],
    queryFn: () => fetchTraces({ page: 1, limit: 8 }),
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

  const refresh = () => {
    summaryQuery.refetch();
    flowQuery.refetch();
    nearbyQuery.refetch();
  };

  return (
    <main className="trace-detail-page trace-workbench">
      <header className="trace-workbench-header">
        <div className="trace-title-cluster">
          <Link to="/traces" search={{ page: 1 }} className="button subtle">
            <Icon name="arrow-left" />
            Traces
          </Link>
          <div>
            <h2 title={traceId}>{summary?.name || shortId(traceId, 28)}</h2>
            <p>{shortId(traceId, 24)}</p>
          </div>
        </div>

        <div className="trace-workbench-actions">
          <span className={`status-pill ${summary?.endedAt === null ? "live" : "neutral"}`}>
            {summary?.endedAt === null ? "Active" : "Materialized"}
          </span>
          <button
            className="button subtle"
            type="button"
            onClick={refresh}
            disabled={summaryQuery.isFetching || flowQuery.isFetching}
          >
            <Icon name="refresh" className={flowQuery.isFetching ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <section className="trace-workbench-metrics">
        <Metric label="Nodes" value={formatCompactNumber(summary?.nodeCount ?? 0)} />
        <Metric label="Edges" value={formatCompactNumber(summary?.edgeCount ?? 0)} />
        <Metric
          label="Duration"
          value={summary ? formatDuration(summary.startedAt, summary.endedAt) : "-"}
        />
        <Metric
          label="Diagnostics"
          value={String(summary ? diagnosticCount(summary) : 0)}
          alert={Boolean(summary && diagnosticCount(summary))}
        />
      </section>

      <section className="trace-workbench-grid">
        <aside className="trace-rail">
          <div className="rail-heading">
            <span>Recent traces</span>
            <Link to="/traces" search={{ page: 1 }}>All</Link>
          </div>
          <div className="rail-list">
            {nearbyQuery.data?.traces.map((trace) => (
              <Link
                key={trace.traceId}
                to="/traces/$traceId"
                params={{ traceId: trace.traceId }}
                search={{ threshold: trace.minImportanceLevel, cursor: undefined }}
                className={`rail-trace ${trace.traceId === traceId ? "active" : ""}`}
              >
                <strong>{trace.name || shortId(trace.traceId, 12)}</strong>
                <span>{formatCompactNumber(trace.nodeCount)} nodes</span>
              </Link>
            ))}
          </div>
        </aside>

        <section className="trace-graph-workspace">
          <GraphToolbar
            summary={summary}
            flow={flowQuery.data}
            threshold={threshold}
            onThresholdChange={(value) => updateSearch({ threshold: value })}
          />

          <div className="graph-frame trace-graph-frame">
            {summaryQuery.isError && (
              <GraphEmpty
                icon="shield"
                title="Trace not available"
                copy="This trace is not visible for the current account."
                action={<Link to="/traces" search={{ page: 1 }} className="button primary">Back to traces</Link>}
              />
            )}

            {!summaryQuery.isError && flowQuery.isLoading && <GraphLoading />}

            {!summaryQuery.isError && flowQuery.isError && (
              <GraphEmpty
                icon="terminal"
                title="Projection unavailable"
                copy="The bounded graph window could not be loaded."
                action={<button className="button primary" onClick={() => flowQuery.refetch()}>Retry</button>}
              />
            )}

            {!summaryQuery.isError && flowQuery.data && (
              <TraceCanvas
                flow={flowQuery.data}
                summary={summary}
                selected={selected}
                onSelect={setSelected}
              />
            )}

            {flowQuery.data && (
              <div className="window-pagination floating-panel">
                <button
                  type="button"
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
                  {flowQuery.data.metadata.paging.fromFlowOrder}-{flowQuery.data.metadata.paging.toFlowOrder}
                  <small>of {formatCompactNumber(flowQuery.data.metadata.paging.totalNodeCount)}</small>
                </span>
                <button
                  type="button"
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

        <Inspector selected={selected} summary={summary} />
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string; alert?: boolean }) {
  return (
    <article className={`workbench-metric ${props.alert ? "alert" : ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
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

  return (
    <div className="graph-toolbar trace-toolbar">
      <div className="toolbar-stat">
        <span>Visible</span>
        <strong>{props.flow?.metadata.visibleNodeCount ?? 0}</strong>
      </div>
      <div className="toolbar-stat">
        <span>Collapsed</span>
        <strong>{props.flow?.metadata.ghostNodeCount ?? 0}</strong>
      </div>
      <label className="importance-control compact">
        <span>
          <Icon name="filter" />
          Importance {formatImportance(props.threshold, props.summary?.importanceLabels)}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={props.threshold}
          onChange={(event) => props.onThresholdChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

function TraceCanvas(props: {
  flow: ProjectedFlowResult;
  summary?: TraceSummary;
  selected: SelectedItem | null;
  onSelect: (selected: SelectedItem | null) => void;
}) {
  const graph = useMemo(
    () => buildFlow(props.flow, props.summary, props.selected),
    [props.flow, props.summary, props.selected],
  );

  if (props.flow.nodes.length === 0) {
    return (
      <GraphEmpty
        icon="graph"
        title="No nodes in this window"
        copy="Adjust the threshold or move to another graph window."
      />
    );
  }

  return (
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
      minZoom={0.16}
      maxZoom={1.8}
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
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#384151" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => String(node.style?.backgroundColor ?? "#8ee4af")}
        maskColor="rgba(6, 12, 20, 0.72)"
      />
    </ReactFlow>
  );
}

const TraceNodeCard = memo(function TraceNodeCard(props: NodeProps<TraceFlowNode>) {
  const node = props.data.value;

  if (node.kind === "ghost") {
    return (
      <div className={`trace-node-card ghost ${props.data.selected ? "selected" : ""}`}>
        <Handle type="target" position={Position.Left} />
        <div className="node-card-top">
          <span className="node-kind-icon ghost"><Icon name="layers" /></span>
          <strong>{node.hiddenNodeCount} hidden</strong>
        </div>
        <p>{summarizeTypes(node.nodeTypeCounts)}</p>
        <small>Flow {node.flowOrderStart}-{node.flowOrderEnd}</small>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div className={`trace-node-card ${props.data.selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-card-top">
        <span className="node-kind-icon"><Icon name="activity" /></span>
        <strong>{formatImportance(node.importanceLevel, props.data.importanceLabels)}</strong>
      </div>
      <h3>{nodeLabel(node.nodeType, node.data)}</h3>
      <p>{node.nodeType}</p>
      <small>{formatTime(node.startedAt)} · #{node.flowOrder}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = {
  "trace-node": TraceNodeCard,
};

function Inspector(props: { selected: SelectedItem | null; summary?: TraceSummary }) {
  if (!props.selected) {
    return (
      <aside className="inspector trace-inspector">
        <h3>Trace summary</h3>
        <DetailRow label="Started" value={props.summary ? formatDate(props.summary.startedAt) : "-"} />
        <DetailRow label="Materialized" value={props.summary ? formatDate(props.summary.materializedAt) : "-"} />
        <DetailRow
          label="Importance"
          value={props.summary
            ? `${formatImportance(props.summary.minImportanceLevel)}-${formatImportance(props.summary.maxImportanceLevel)}`
            : "-"}
        />
        <Diagnostics summary={props.summary} />
      </aside>
    );
  }

  return (
    <aside className="inspector trace-inspector">
      {props.selected.type === "node" ? (
        <NodeInspector
          node={props.selected.value}
          importanceLabels={props.summary?.importanceLabels}
        />
      ) : (
        <EdgeInspector edge={props.selected.value} />
      )}
    </aside>
  );
}

function NodeInspector({ node, importanceLabels }: {
  node: ProjectedFlowNode;
  importanceLabels?: Record<number, string>;
}) {
  if (node.kind === "ghost") {
    return (
      <>
        <h3>Collapsed subflow</h3>
        <DetailRow label="Hidden nodes" value={String(node.hiddenNodeCount)} />
        <DetailRow label="Internal edges" value={String(node.hiddenEdgeCount)} />
        <DetailRow label="Flow range" value={`${node.flowOrderStart}-${node.flowOrderEnd}`} />
        <DetailRow
          label="Importance"
          value={`${formatImportance(node.minImportanceLevel, importanceLabels)}-${formatImportance(node.maxImportanceLevel, importanceLabels)}`}
        />
        <DataBlock data={node.nodeTypeCounts} title="Node types" />
      </>
    );
  }

  return (
    <>
      <h3>{nodeLabel(node.nodeType, node.data)}</h3>
      <DetailRow label="Type" value={node.nodeType} />
      <DetailRow label="Importance" value={formatImportance(node.importanceLevel, importanceLabels)} />
      <DetailRow label="Duration" value={formatDuration(node.startedAt, node.endedAt)} />
      <DetailRow label="Flow order" value={`#${node.flowOrder}`} />
      <DataBlock data={node.data} title="Attributes" />
    </>
  );
}

function EdgeInspector({ edge }: { edge: ProjectedFlowEdge }) {
  return (
    <>
      <h3>{edge.edgeType}</h3>
      <DetailRow label="From" value={shortId(edge.fromNodeId, 18)} />
      <DetailRow label="To" value={shortId(edge.toNodeId, 18)} />
      <DetailRow label="Count" value={String(edge.edgeCount)} />
      <DetailRow label="Duration" value={formatDuration(edge.startedAt, edge.endedAt)} />
      <DetailRow label="Updated" value={formatTime(edge.startedAt)} />
    </>
  );
}

function Diagnostics({ summary }: { summary?: TraceSummary }) {
  const diagnostics = summary ? diagnosticItems(summary) : [];
  if (diagnostics.length === 0) {
    return <p className="muted-copy">No diagnostics reported.</p>;
  }

  return (
    <div className="diagnostic-stack">
      {diagnostics.map((item) => (
        <DetailRow key={item.label} label={item.label} value={String(item.value)} />
      ))}
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function DataBlock(props: { data: Record<string, unknown>; title: string }) {
  const entries = Object.entries(props.data ?? {});
  return (
    <section className="data-block-wrap">
      <h4>{props.title}</h4>
      {entries.length === 0 ? (
        <p className="muted-copy">No attributes recorded.</p>
      ) : (
        <div className="data-block">
          {entries.map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <code>{String(value)}</code>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GraphLoading() {
  return (
    <div className="graph-empty">
      <div className="empty-icon"><Icon name="refresh" className="spinning" /></div>
      <h3>Loading projection</h3>
      <p>Preparing bounded trace graph.</p>
    </div>
  );
}

function GraphEmpty(props: {
  icon: "graph" | "shield" | "terminal";
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="graph-empty">
      <div className="empty-icon"><Icon name={props.icon} /></div>
      <h3>{props.title}</h3>
      <p>{props.copy}</p>
      {props.action}
    </div>
  );
}

function buildFlow(
  flow: ProjectedFlowResult,
  summary: TraceSummary | undefined,
  selected: SelectedItem | null,
): {
  nodes: TraceFlowNode[];
  edges: TraceFlowEdge[];
  nodeById: Map<string, ProjectedFlowNode>;
  edgeById: Map<string, ProjectedFlowEdge>;
} {
  const orderedNodes = [...flow.nodes].sort((a, b) => nodeFlowStart(a) - nodeFlowStart(b));
  const nodeById = new Map(orderedNodes.map((node) => [node.id, node]));
  const edgeById = new Map(flow.edges.map((edge) => [edge.id, edge]));
  const positions = layoutGraph(orderedNodes, flow.edges);

  const nodes: TraceFlowNode[] = orderedNodes.map((node) => ({
    id: node.id,
    type: "trace-node",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      value: node,
      importanceLabels: summary?.importanceLabels,
      selected: selected?.type === "node" && selected.value.id === node.id,
    },
    style: {
      width: NODE_WIDTH,
      minHeight: NODE_HEIGHT,
      backgroundColor: node.kind === "ghost" ? "#1d2736" : "#0f1b2a",
      borderColor: selected?.type === "node" && selected.value.id === node.id ? "#8ee4af" : "#243044",
    },
  }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: TraceFlowEdge[] = flow.edges
    .filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
    .map((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      label: edge.edgeType,
      animated: selected?.type === "edge" && selected.value.id === edge.id,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#7f8da3" },
      data: { value: edge },
      style: {
        stroke: selected?.type === "edge" && selected.value.id === edge.id ? "#8ee4af" : "#64748b",
        strokeWidth: selected?.type === "edge" && selected.value.id === edge.id ? 3 : 1.8,
      },
    }));

  return { nodes, edges, nodeById, edgeById };
}

function layoutGraph(nodes: ProjectedFlowNode[], edges: ProjectedFlowEdge[]): Map<string, { x: number; y: number }> {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  }

  const indegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)?.length ?? 0]));
  const rank = new Map<string, number>();
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0);
  const visited = new Set<string>();

  for (const node of queue) rank.set(node.id, 0);
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    for (const child of outgoing.get(current.id) ?? []) {
      rank.set(child, Math.max(rank.get(child) ?? 0, (rank.get(current.id) ?? 0) + 1));
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if ((indegree.get(child) ?? 0) <= 0) {
        const next = nodes.find((node) => node.id === child);
        if (next) queue.push(next);
      }
    }
  }

  let fallbackRank = Math.max(0, ...rank.values());
  for (const node of nodes) {
    if (!rank.has(node.id)) rank.set(node.id, ++fallbackRank);
  }

  const columns = new Map<number, ProjectedFlowNode[]>();
  for (const node of nodes) {
    const column = rank.get(node.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), node]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [column, columnNodes] of columns) {
    columnNodes
      .sort((a, b) => nodeFlowStart(a) - nodeFlowStart(b))
      .forEach((node, row) => positions.set(node.id, {
        x: column * COLUMN_GAP,
        y: row * ROW_GAP,
      }));
  }

  return positions;
}

function nodeFlowStart(node: ProjectedFlowNode): number {
  return node.kind === "ghost" ? node.flowOrderStart : node.flowOrder;
}

function summarizeTypes(counts: Record<string, number>): string {
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (entries.length === 0) return "Mixed hidden nodes";
  return entries.map(([type, count]) => `${type} ${count}`).join(", ");
}

function normalizeThreshold(value: number | undefined, min: number, max: number): number {
  if (value === undefined || Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function diagnosticItems(summary: TraceSummary): Array<{ label: string; value: number }> {
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

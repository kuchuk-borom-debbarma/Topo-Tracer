import { useMemo, forwardRef, useState, useRef, useCallback } from "react";
import type { TraceLayoutResponse, ReadNode } from "../api/client";
import { computeLayout, getDepthColor, getDepthColorDim, LAYOUT } from "../utils/layout";
import { NodeCard, NodeInspector } from "./NodeRow";

type Props = {
  data: TraceLayoutResponse;
  activeTags: Set<string>;
  playbackStep: number | null;
  chronoItems: Array<{ id: string; name: string; type: "node" | "container"; startTimeUs: number }>;
  layoutMode: "nested" | "dag" | "graph";
};

const CONTAINER_ICONS: Record<string, string> = {
  service: "⬡",
  module: "◈",
  function: "λ",
  workflow: "⟳",
  gateway: "⊞",
  database: "⊙",
  queue: "⊟",
};

function getContainerIcon(type: string): string {
  const t = type.toLowerCase();
  return CONTAINER_ICONS[t] ?? "⬡";
}

const ARROW_SIZE = 8;

export const TraceFlowCanvas = forwardRef<HTMLDivElement, Props>(
  ({ data, activeTags, playbackStep, chronoItems, layoutMode }, forwardedRef) => {
    const { containers, nodes, edges } = data;

    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredContainerId, setHoveredContainerId] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<ReadNode | null>(null);

    const localRef = useRef<HTMLDivElement | null>(null);

    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const layout = useMemo(
      () => computeLayout(containers, nodes, edges, activeTags, layoutMode),
      [containers, nodes, edges, activeTags, layoutMode]
    );

    const { containerLayouts, nodePositions, parentArrows, wires, canvasWidth, canvasHeight } =
      layout;

    const PAD = LAYOUT.CANVAS_PAD;

    // ── Causal execution path tracing (Upstream/Downstream highlighting) ──
    const causalPath = useMemo(() => {
      if (!hoveredNodeId) return null;

      const upstream = new Set<string>();
      const downstream = new Set<string>();
      const activeEdges = new Set<string>();

      // Build graph adjacency list
      const adjForward = new Map<string, string[]>();
      const adjBackward = new Map<string, string[]>();

      for (const edge of edges) {
        const fList = adjForward.get(edge.fromNodeId) || [];
        fList.push(edge.toNodeId);
        adjForward.set(edge.fromNodeId, fList);

        const bList = adjBackward.get(edge.toNodeId) || [];
        bList.push(edge.fromNodeId);
        adjBackward.set(edge.toNodeId, bList);
      }

      // BFS Forward (downstream)
      const qForward = [hoveredNodeId];
      const visitedF = new Set<string>([hoveredNodeId]);
      while (qForward.length > 0) {
        const curr = qForward.shift()!;
        downstream.add(curr);
        for (const next of adjForward.get(curr) || []) {
          if (!visitedF.has(next)) {
            visitedF.add(next);
            qForward.push(next);
            activeEdges.add(`${curr}->${next}`);
          }
        }
      }

      // BFS Backward (upstream)
      const qBackward = [hoveredNodeId];
      const visitedB = new Set<string>([hoveredNodeId]);
      while (qBackward.length > 0) {
        const curr = qBackward.shift()!;
        upstream.add(curr);
        for (const prev of adjBackward.get(curr) || []) {
          if (!visitedB.has(prev)) {
            visitedB.add(prev);
            qBackward.push(prev);
            activeEdges.add(`${prev}->${curr}`);
          }
        }
      }

      return { upstream, downstream, activeEdges };
    }, [edges, hoveredNodeId]);

    // ── Pre-compute playback active and current focus sets ──
    const activePlaybackIds = useMemo(() => {
      const activeIds = new Set<string>();
      if (playbackStep === null) return activeIds;

      for (let i = 0; i <= playbackStep; i++) {
        const item = chronoItems[i];
        if (item) {
          activeIds.add(item.id);
          if (item.type === "node") {
            const node = nodePositions.get(item.id)?.node;
            if (node) {
              activeIds.add(node.containerId);
            }
          }
        }
      }
      return activeIds;
    }, [chronoItems, playbackStep, nodePositions]);

    const currentPlaybackId = useMemo(() => {
      if (playbackStep === null) return null;
      return chronoItems[playbackStep]?.id ?? null;
    }, [chronoItems, playbackStep]);

    if (containerLayouts.length === 0) {
      return (
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No matching elements</div>
          <div className="empty-state-desc">
            Try adjusting your active tag filters to discover execution paths.
          </div>
        </div>
      );
    }

    const hasActiveHover = hoveredNodeId !== null || hoveredContainerId !== null;

    return (
      <div
        ref={setRef}
        className="flow-canvas"
        style={{ width: canvasWidth + PAD, height: canvasHeight + PAD }}
      >

        {/* ── Container Cards ── */}
        {containerLayouts.map((cl) => {
          const depthColor = getDepthColor(cl.depth);
          const depthColorDim = getDepthColorDim(cl.depth);

          const isCausalHighlighted = causalPath
            ? causalPath.upstream.has(cl.containerId) || causalPath.downstream.has(cl.containerId)
            : hoveredContainerId === cl.containerId;

          const isCausalDimmed = causalPath
            ? !isCausalHighlighted
            : hasActiveHover && !isCausalHighlighted && hoveredContainerId !== null;

          const isPlaybackPending = playbackStep !== null && !activePlaybackIds.has(cl.containerId);

          return (
            <div
              key={cl.containerId}
              className={`container-card${isCausalHighlighted ? " container-card--highlighted" : ""}${isPlaybackPending ? " playback-pending" : ""}`}
              style={{
                position: "absolute",
                top: cl.top + PAD,
                left: cl.left + PAD,
                width: cl.width,
                height: cl.height,
                borderLeftColor: depthColor,
                opacity: isCausalDimmed ? 0.08 : 1,
                zIndex: 3 + cl.depth,
                transition: "opacity 180ms ease, box-shadow 180ms ease, filter 180ms ease",
                boxShadow: isCausalHighlighted
                  ? `0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px ${depthColor}55, 0 0 24px ${depthColor}18`
                  : `0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px ${depthColor}18`,
              }}
              onMouseEnter={() => setHoveredContainerId(cl.containerId)}
              onMouseLeave={() => setHoveredContainerId(null)}
            >
              {/* 2-row header: title row + meta row */}
              <div
                className="container-card-header"
                style={{ background: depthColorDim }}
              >
                {/* Row 1: icon + name */}
                <div className="container-card-title">
                  <span className="container-card-icon" style={{ color: depthColor }}>
                    {getContainerIcon(cl.type)}
                  </span>
                  <span className="container-card-name" title={cl.name}>
                    {cl.name}
                  </span>
                </div>
                {/* Row 2: depth chip + type pill */}
                <div className="container-card-pills">
                  <span
                    className="container-depth-chip"
                    style={{
                      color: depthColor,
                      background: `color-mix(in srgb, ${depthColor} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${depthColor} 32%, transparent)`,
                    }}
                  >
                    depth {cl.depth}
                  </span>
                  <span className="container-type-pill">{cl.type}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── Node Cards ── */}
        {Array.from(nodePositions.values()).map(({ node, top, left, width, height }) => {
          const container = containerLayouts.find((cl) => cl.containerId === node.containerId);
          const depth = container ? container.depth : 0;

          const isCausalHighlighted = causalPath
            ? causalPath.upstream.has(node.id) || causalPath.downstream.has(node.id)
            : hoveredNodeId === node.id || hoveredContainerId === node.containerId;

          const isCausalDimmed = causalPath
            ? !isCausalHighlighted
            : hasActiveHover && !isCausalHighlighted;

          const isPlaybackPending = playbackStep !== null && !activePlaybackIds.has(node.id);
          const isActivePlaybackNode = playbackStep !== null && node.id === currentPlaybackId;

          return (
            <div
              key={node.id}
              className={isPlaybackPending ? "playback-pending" : ""}
              style={{
                position: "absolute",
                top: top + PAD,
                left: left + PAD,
                width: width,
                height: height,
                zIndex: 10 + depth,
                opacity: isCausalDimmed ? 0.08 : 1,
                transition: "opacity 180ms ease, box-shadow 180ms ease, filter 180ms ease",
              }}
            >
              <NodeCard
                node={node}
                isHovered={hoveredNodeId === node.id}
                isSelected={selectedNode?.id === node.id}
                onHover={setHoveredNodeId}
                onSelect={setSelectedNode}
                style={isActivePlaybackNode ? {
                  boxShadow: "0 0 14px var(--accent-primary-glow), 0 0 0 1px var(--accent-primary)",
                  borderColor: "var(--accent-primary)",
                  background: "var(--accent-primary-bg)",
                  animation: "node-pulse-glow 1.5s ease-in-out infinite",
                  filter: "drop-shadow(0 0 8px var(--accent-primary-glow))",
                } : undefined}
              />
            </div>
          );
        })}

        {/* ── SVG overlay: parent arrows + node edge wires ── */}
        <svg
          className="flow-edges-svg"
          width={canvasWidth + PAD}
          height={canvasHeight + PAD}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible", zIndex: 2 }}
        >
          <defs>
            {/* Arrowhead for node wires */}
            <marker
              id="arrow-wire"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1}
              refY={ARROW_SIZE / 2}
              orient="auto"
            >
              <polygon
                points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE / 2}, 0 ${ARROW_SIZE}`}
                fill="var(--accent-primary)"
                opacity="0.8"
              />
            </marker>

            {/* Arrowhead for cross-container wires */}
            <marker
              id="arrow-wire-cross"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1}
              refY={ARROW_SIZE / 2}
              orient="auto"
            >
              <polygon
                points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE / 2}, 0 ${ARROW_SIZE}`}
                fill="hsl(280, 80%, 72%)"
                opacity="0.9"
              />
            </marker>

            {/* Arrowhead for highlighted wires */}
            <marker
              id="arrow-wire-highlight"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1}
              refY={ARROW_SIZE / 2}
              orient="auto"
            >
              <polygon
                points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE / 2}, 0 ${ARROW_SIZE}`}
                fill="var(--accent-secondary)"
                opacity="1"
              />
            </marker>

            {/* Arrowhead for parent arrows (per depth color, reuse a generic gray) */}
            <marker
              id="arrow-parent"
              markerWidth={6}
              markerHeight={6}
              refX={5}
              refY={3}
              orient="auto"
            >
              <polygon
                points="0 0, 6 3, 0 6"
                fill="currentColor"
                opacity="0.6"
              />
            </marker>
          </defs>

          {/* ── Parent arrows: horizontal S-curves, right-center → left-center ── */}
          {parentArrows.map((pa, i) => {
            const fx = pa.fromX + PAD;
            const fy = pa.fromY + PAD;
            const tx = pa.toX + PAD;
            const ty = pa.toY + PAD;
            const dx = tx - fx;
            // S-curve: pull control points horizontally to create smooth horizontal arc
            const curve = Math.max(24, Math.abs(dx) * 0.5);
            const d = `M ${fx} ${fy} C ${fx + curve} ${fy}, ${tx - curve} ${ty}, ${tx} ${ty}`;

            const isHovered =
              hoveredContainerId === pa.fromContainerId ||
              hoveredContainerId === pa.toContainerId;

            return (
              <path
                key={`pa-${i}`}
                d={d}
                fill="none"
                stroke={pa.color}
                strokeWidth={isHovered ? 2 : 1.5}
                opacity={isHovered ? 0.85 : 0.45}
                markerEnd={`url(#arrow-parent-${i})`}
                style={{ transition: "opacity 180ms ease" }}
              />
            );
          })}

          {/* Arrowheads for parent arrows (one per, so color matches) */}
          {parentArrows.map((pa, i) => (
            <defs key={`pad-${i}`}>
              <marker
                id={`arrow-parent-${i}`}
                markerWidth={7}
                markerHeight={7}
                refX={6}
                refY={3.5}
                orient="auto"
              >
                <polygon
                  points="0 0, 7 3.5, 0 7"
                  fill={pa.color}
                  opacity="0.75"
                />
              </marker>
            </defs>
          ))}

          {/* ── Node edge wires ── */}
          {wires.map((wire, i) => {
            const fx = wire.fromX + PAD + 4;
            const fy = wire.fromY + PAD;
            const tx = wire.toX + PAD - 6;
            const ty = wire.toY + PAD;
            const dx = tx - fx;
            const dy = ty - fy;
            const isStraight = Math.abs(dy) < 2;

            let d: string;
            let midX: number;
            let midY: number;

            if (isStraight) {
              d = `M ${fx} ${fy} L ${tx} ${ty}`;
              midX = (fx + tx) / 2;
              midY = fy;
            } else {
              const shoulderScale = 0.4 + Math.min(0.2, Math.abs(dy) / 500);
              const offset = Math.max(32, Math.abs(dx) * shoulderScale);
              const cx1 = fx + offset;
              const cx2 = tx - offset;
              d = `M ${fx} ${fy} C ${cx1} ${fy}, ${cx2} ${ty}, ${tx} ${ty}`;
              // Mid-point approximation for cubic bezier at t=0.5
              midX = 0.125 * fx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx;
              midY = (fy + ty) / 2;
            }

            const isCross = wire.isCrossContainer;

            const isCausalHighlighted = causalPath
              ? causalPath.activeEdges.has(`${wire.fromNodeId}->${wire.toNodeId}`)
              : hoveredNodeId
              ? wire.fromNodeId === hoveredNodeId || wire.toNodeId === hoveredNodeId
              : false;

            const isCausalDimmedWire = causalPath
              ? !isCausalHighlighted
              : hasActiveHover && !isCausalHighlighted;

            const isPlaybackPending = playbackStep !== null && 
              (!activePlaybackIds.has(wire.fromNodeId) || !activePlaybackIds.has(wire.toNodeId));

            const isWireActiveFlow = isCausalHighlighted || 
              (playbackStep !== null && (wire.fromNodeId === currentPlaybackId || wire.toNodeId === currentPlaybackId));

            const isDirect = wire.edge.distance === 0;

            let strokeColor = isCross
              ? "hsl(280, 80%, 72%)"
              : "var(--accent-primary)";
            if (isCausalHighlighted) strokeColor = "var(--accent-secondary)";

            const strokeWidth = isCausalHighlighted ? 2.5 : isCross ? 2 : 1.5;
            const opacity = isPlaybackPending ? 0.02 : isCausalHighlighted ? 1 : isCausalDimmedWire ? 0.04 : isCross ? 0.75 : 0.6;

            const markerEnd = isCausalHighlighted
              ? "url(#arrow-wire-highlight)"
              : isCross
              ? "url(#arrow-wire-cross)"
              : "url(#arrow-wire)";

            const showBadge = wire.edge.distance > 0;
            const badgeBg = "rgba(10,12,22,0.88)";
            const badgeBorder = isCausalHighlighted
              ? "var(--accent-secondary)"
              : isCross
              ? "hsl(280, 80%, 72%)"
              : "hsla(217, 91%, 60%, 0.5)";
            const badgeText = isCausalHighlighted
              ? "var(--accent-secondary)"
              : isCross
              ? "hsl(280, 95%, 85%)"
              : "var(--accent-primary)";

            return (
              <g
                key={`w-${i}`}
                style={{
                  opacity,
                  transition: "opacity 200ms ease",
                }}
              >
                <path
                  d={d}
                  fill="none"
                  className={isWireActiveFlow ? "wire-active-flow" : ""}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isWireActiveFlow ? undefined : isDirect ? undefined : "6 4"}
                  markerEnd={markerEnd}
                  style={{
                    filter: isWireActiveFlow
                      ? "drop-shadow(0 0 5px var(--accent-primary))"
                      : isCausalHighlighted
                      ? "drop-shadow(0 0 4px var(--accent-secondary))"
                      : undefined,
                    transition: "stroke-dashoffset 100ms linear",
                  }}
                />
                {showBadge && (
                  <g style={{ opacity: isPlaybackPending ? 0 : 1, transition: "opacity 180ms ease" }}>
                    <rect
                      x={midX - 24}
                      y={midY - 8}
                      width={48}
                      height={16}
                      rx={8}
                      fill={badgeBg}
                      stroke={badgeBorder}
                      strokeWidth={0.8}
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fill={badgeText}
                      fontSize={8.5}
                      fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      +{wire.edge.distance} step{wire.edge.distance > 1 ? "s" : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Floating node inspector (portal) ── */}
        {selectedNode && (
          <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    );
  }
);

TraceFlowCanvas.displayName = "TraceFlowCanvas";

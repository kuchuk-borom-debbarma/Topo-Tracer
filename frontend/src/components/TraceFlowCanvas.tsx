import { useMemo, forwardRef, useState, useRef, useCallback } from "react";
import type { TraceLayoutResponse, ReadNode } from "../api/client";
import { computeLayout, getDepthColor, getDepthColorDim, LAYOUT } from "../utils/layout";
import { NodeCard, NodeInspector } from "./NodeRow";

type Props = {
  data: TraceLayoutResponse;
  activeTags: Set<string>;
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
  ({ data, activeTags }, forwardedRef) => {
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
      () => computeLayout(containers, nodes, edges, activeTags),
      [containers, nodes, edges, activeTags]
    );

    const { containerLayouts, nodePositions, parentArrows, wires, canvasWidth, canvasHeight } =
      layout;

    const PAD = LAYOUT.CANVAS_PAD;

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
          const isHighlighted = hoveredContainerId === cl.containerId;
          const isDimmed =
            hasActiveHover && !isHighlighted && hoveredContainerId !== null;

          // Nodes for this container
          const containerNodesList = Array.from(nodePositions.values())
            .filter((np) => np.node.containerId === cl.containerId)
            .sort(
              (a, b) =>
                a.node.localSequence - b.node.localSequence ||
                a.node.startTimeUs - b.node.startTimeUs
            );

          const visibleTags = cl.tags.slice(0, 3);
          const extraTagCount = cl.tags.length - 3;

          return (
            <div
              key={cl.containerId}
              className={`container-card${isHighlighted ? " container-card--highlighted" : ""}`}
              style={{
                position: "absolute",
                top: cl.top + PAD,
                left: cl.left + PAD,
                width: cl.width,
                height: cl.height,
                borderLeftColor: depthColor,
                opacity: isDimmed ? 0.3 : 1,
                transition: "opacity 150ms ease, box-shadow 150ms ease",
                boxShadow: isHighlighted
                  ? `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${depthColor}44, inset 0 0 0 1px rgba(255,255,255,0.04)`
                  : "0 4px 20px rgba(0,0,0,0.35)",
              }}
              onMouseEnter={() => setHoveredContainerId(cl.containerId)}
              onMouseLeave={() => setHoveredContainerId(null)}
            >
              {/* Header */}
              <div
                className="container-card-header"
                style={{ background: depthColorDim }}
              >
                <span
                  className="container-card-icon"
                  style={{ color: depthColor }}
                >
                  {getContainerIcon(cl.type)}
                </span>
                <span className="container-card-name">{cl.name}</span>

                <div className="container-card-meta">
                  <span
                    className="container-depth-chip"
                    style={{
                      color: depthColor,
                      background: `color-mix(in srgb, ${depthColor} 12%, transparent)`,
                      borderColor: `color-mix(in srgb, ${depthColor} 30%, transparent)`,
                    }}
                  >
                    D{cl.depth}
                  </span>
                  <span className="container-type-pill">{cl.type}</span>
                </div>
              </div>

              {/* Tags row */}
              {visibleTags.length > 0 && (
                <div className="container-card-tags">
                  {visibleTags.map((tag) => (
                    <span key={tag} className="container-card-tag">
                      #{tag}
                    </span>
                  ))}
                  {extraTagCount > 0 && (
                    <span className="container-card-tag container-card-tag--more">
                      +{extraTagCount}
                    </span>
                  )}
                </div>
              )}

              {/* Node cards */}
              <div className="container-card-body">
                {containerNodesList.map(({ node }) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    isHovered={hoveredNodeId === node.id}
                    isSelected={selectedNode?.id === node.id}
                    onHover={setHoveredNodeId}
                    onSelect={setSelectedNode}
                  />
                ))}
                {containerNodesList.length === 0 && (
                  <div className="container-card-empty">No visible nodes</div>
                )}
              </div>
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

          {/* ── Parent relationship arrows ── */}
          {parentArrows.map((pa, i) => {
            const fx = pa.fromX + PAD;
            const fy = pa.fromY + PAD;
            const tx = pa.toX + PAD;
            const ty = pa.toY + PAD;
            const dx = tx - fx;
            const offset = Math.max(30, dx * 0.45);
            const d = `M ${fx} ${fy} C ${fx + offset} ${fy}, ${tx - offset} ${ty}, ${tx} ${ty}`;

            const isHoveredArrow =
              hoveredContainerId === pa.fromContainerId ||
              hoveredContainerId === pa.toContainerId;

            return (
              <path
                key={`pa-${i}`}
                d={d}
                fill="none"
                stroke={pa.color}
                strokeWidth={isHoveredArrow ? 1.5 : 1}
                strokeDasharray="5 3"
                opacity={isHoveredArrow ? 0.65 : 0.28}
                style={{ transition: "opacity 150ms ease, stroke-width 150ms ease" }}
              />
            );
          })}

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
            const isHighlighted = hoveredNodeId
              ? wire.fromNodeId === hoveredNodeId || wire.toNodeId === hoveredNodeId
              : false;
            const isDimmedWire = hasActiveHover && !isHighlighted;
            const isDirect = wire.edge.distance === 0;

            let strokeColor = isCross
              ? "hsl(280, 80%, 72%)"
              : "var(--accent-primary)";
            if (isHighlighted) strokeColor = "var(--accent-secondary)";

            const strokeWidth = isHighlighted ? 2.5 : isCross ? 2 : 1.5;
            const opacity = isHighlighted ? 1 : isDimmedWire ? 0.1 : isCross ? 0.75 : 0.6;

            const markerEnd = isHighlighted
              ? "url(#arrow-wire-highlight)"
              : isCross
              ? "url(#arrow-wire-cross)"
              : "url(#arrow-wire)";

            const showBadge = wire.edge.distance > 0;
            const badgeBg = "rgba(10,12,22,0.88)";
            const badgeBorder = isHighlighted
              ? "var(--accent-secondary)"
              : isCross
              ? "hsl(280, 80%, 72%)"
              : "hsla(217, 91%, 60%, 0.5)";
            const badgeText = isHighlighted
              ? "var(--accent-secondary)"
              : isCross
              ? "hsl(280, 95%, 85%)"
              : "var(--accent-primary)";

            return (
              <g
                key={`w-${i}`}
                style={{
                  opacity,
                  transition: "opacity 150ms ease",
                }}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isDirect ? undefined : "6 4"}
                  markerEnd={markerEnd}
                  style={{
                    filter: isHighlighted
                      ? "drop-shadow(0 0 4px var(--accent-secondary))"
                      : undefined,
                  }}
                />
                {showBadge && (
                  <g>
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

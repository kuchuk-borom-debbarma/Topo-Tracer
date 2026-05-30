import { useMemo, forwardRef, useState, useRef } from "react";
import type { TraceLayoutResponse } from "../api/client";
import { computeLayout, LAYOUT } from "../utils/layout";
import { NodeRow } from "./NodeRow";

type Props = {
  data: TraceLayoutResponse;
  activeTags: Set<string>;
};

export const TraceFlowCanvas = forwardRef<HTMLDivElement, Props>(
  ({ data, activeTags }, forwardedRef) => {
    const { containers, nodes, edges } = data;

    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredContainerId, setHoveredContainerId] = useState<string | null>(null);
    
    const localRef = useRef<HTMLDivElement | null>(null);

    // Merge forwarded ref and local ref cleanly
    const setRef = (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    // Calculate layout via client-side V3 Indented Container-Node flow engine
    const layout = useMemo(
      () => computeLayout(containers, nodes, edges, activeTags),
      [containers, nodes, edges, activeTags]
    );

    const {
      containerLayouts,
      nodePositions,
      wires,
      canvasWidth,
      canvasHeight,
    } = layout;

    const PAD = LAYOUT.CANVAS_PAD;
    const ARROW_SIZE = 7;

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

    return (
      <div
        ref={setRef}
        className="flow-canvas"
        style={{ width: canvasWidth + PAD, height: canvasHeight + PAD }}
      >
        {/* ── Glassmorphic Container Cards ── */}
        {containerLayouts.map((cl) => {
          const isHighlighted = hoveredContainerId === cl.containerId;
          const hasHoveredNode = hoveredNodeId !== null;
          const isDimmed = (hoveredContainerId !== null && !isHighlighted) || (hasHoveredNode);

          return (
            <div
              key={cl.containerId}
              className={`container-card glassmorphic-container${isHighlighted ? " is-highlighted" : ""}`}
              style={{
                position: "absolute",
                top: cl.top + PAD,
                left: cl.left + PAD,
                width: cl.width,
                height: cl.height,
                opacity: isDimmed ? 0.35 : 1,
                border: isHighlighted ? "1px solid var(--accent-secondary)" : "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: isHighlighted 
                  ? "0 8px 32px 0 rgba(138, 43, 226, 0.25)"
                  : "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
                transition: "opacity var(--transition-fast), border var(--transition-fast), box-shadow var(--transition-fast)",
              }}
              onMouseEnter={() => setHoveredContainerId(cl.containerId)}
              onMouseLeave={() => setHoveredContainerId(null)}
            >
              {/* Container header card */}
              <div className="container-band-header">
                <span className="container-band-icon">⬡</span>
                <span className="container-band-label">{cl.name}</span>
                <span className="container-band-type">{cl.type}</span>
                {cl.tags && cl.tags.map(t => (
                  <span key={t} className="container-card-chip">#{t}</span>
                ))}
              </div>
            </div>
          );
        })}

        {/* ── SVG edge wires with S-Curves & snap tunneling ── */}
        <svg
          className="flow-edges-svg"
          width={canvasWidth + PAD}
          height={canvasHeight + PAD}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1}
              refY={ARROW_SIZE / 2}
              orient="auto"
            >
              <polygon
                className="edge-arrow"
                points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE / 2}, 0 ${ARROW_SIZE}`}
              />
            </marker>
            <marker
              id="arrowhead-cross"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1}
              refY={ARROW_SIZE / 2}
              orient="auto"
            >
              <polygon
                className="edge-arrow edge-arrow-cross"
                points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE / 2}, 0 ${ARROW_SIZE}`}
              />
            </marker>
            <marker
              id="arrowhead-highlight"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1}
              refY={ARROW_SIZE / 2}
              orient="auto"
            >
              <polygon
                className="edge-arrow-highlight"
                style={{ fill: "var(--accent-secondary)" }}
                points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE / 2}, 0 ${ARROW_SIZE}`}
              />
            </marker>
          </defs>

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
              midY = (fy + ty) / 2;
            } else {
              // Calculate a beautiful S-curve with flat horizontal shoulders.
              const shoulderScale = 0.35 + Math.min(0.2, Math.abs(dy) / 400) + ((i % 3) * 0.03);
              const offset = Math.max(28, dx * shoulderScale);
              const cx1 = fx + offset;
              const cx2 = tx - offset;
              d = `M ${fx} ${fy} C ${cx1} ${fy}, ${cx2} ${ty}, ${tx} ${ty}`;
              
              // Midpoint calculation for cubic bezier at t=0.5
              midX = 0.125 * fx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx;
              midY = (fy + ty) / 2;
            }

            const isCross = wire.isCrossContainer;
            
            // Check active hover highlights
            const hasActiveHover = hoveredNodeId !== null || hoveredContainerId !== null;
            const isHighlighted = hoveredNodeId
              ? (wire.fromNodeId === hoveredNodeId || wire.toNodeId === hoveredNodeId)
              : false;
            
            const isDimmed = hasActiveHover && !isHighlighted;
            
            let strokeColor = isCross ? "hsla(280, 80%, 70%, 0.9)" : "var(--accent-primary)";
            if (isHighlighted) {
              strokeColor = "var(--accent-secondary)";
            }

            const showDistanceBadge = wire.edge.distance > 0;

            return (
              <g key={i}>
                <path
                  d={d}
                  className={isCross ? "edge-line edge-line-cross" : "edge-line"}
                  style={{
                    stroke: strokeColor,
                    strokeWidth: isHighlighted ? 2.5 : isCross ? 2 : 1.5,
                    strokeDasharray: wire.edge.distance > 0 ? "5 4" : undefined,
                    opacity: isHighlighted ? 1 : isDimmed ? 0.12 : isCross ? 0.8 : 0.65,
                    filter: isHighlighted ? "drop-shadow(0 0 5px var(--accent-secondary))" : "none",
                    transition: "stroke var(--transition-fast), stroke-width var(--transition-fast), opacity var(--transition-fast), filter var(--transition-fast)",
                  }}
                  markerEnd={
                    isHighlighted
                      ? "url(#arrowhead-highlight)"
                      : isCross
                      ? "url(#arrowhead-cross)"
                      : "url(#arrowhead)"
                  }
                />
                {showDistanceBadge && (
                  <g style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity var(--transition-fast)" }}>
                    <rect
                      x={midX - 25}
                      y={midY - 9}
                      width={50}
                      height={18}
                      rx={9}
                      fill="rgba(13, 14, 23, 0.85)"
                      stroke={isHighlighted ? "var(--accent-secondary)" : isCross ? "hsla(280, 80%, 70%, 0.6)" : "rgba(138, 43, 226, 0.4)"}
                      strokeWidth={1}
                      style={{ backdropFilter: "blur(4px)" }}
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fill={isHighlighted ? "var(--accent-secondary)" : isCross ? "hsla(280, 95%, 85%, 1)" : "var(--accent-secondary)"}
                      fontSize={9}
                      fontWeight="700"
                      fontFamily="Inter, Roboto, sans-serif"
                    >
                      +{wire.edge.distance} step{wire.edge.distance > 1 ? "s" : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Chronological Node Rows ── */}
        {Array.from(nodePositions.values()).map(({ node, top, left, width, height }) => (
          <div
            key={node.id}
            style={{
              position: "absolute",
              top: top + PAD,
              left: left + PAD,
              width,
              height,
              zIndex: 10,
            }}
          >
            <NodeRow
              node={node}
              isCallingNode={false}
              isHovered={hoveredNodeId === node.id}
              onHover={setHoveredNodeId}
            />
          </div>
        ))}
      </div>
    );
  }
);

TraceFlowCanvas.displayName = "TraceFlowCanvas";

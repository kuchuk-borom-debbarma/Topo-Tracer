import { useMemo, forwardRef, useState, useRef, useCallback } from "react";
import type { TraceLayoutResponse, ReadNode } from "../api/client";
import { computeLayout, getDepthColor, getDepthColorDim, LAYOUT, formatDuration } from "../utils/layout";
import { NodeCard, NodeInspector } from "./NodeRow";

type Props = {
  data: TraceLayoutResponse;
  activeLevel: number;
  onSelectLevel?: (level: number) => void;
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
  ({ data, activeLevel, onSelectLevel, layoutMode }, forwardedRef) => {
    const { containers, nodes, edges, ghostSpans } = data;

    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredContainerId, setHoveredContainerId] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<ReadNode | null>(null);
    
    // V4 hovered Ghost Span tooltip state
    const [hoveredGhost, setHoveredGhost] = useState<{ ghost: any; x: number; y: number } | null>(null);

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
      () => computeLayout(containers, nodes, edges, layoutMode),
      [containers, nodes, edges, layoutMode]
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
        fList.push(edge.toId);
        adjForward.set(edge.fromNodeId, fList);

        const bList = adjBackward.get(edge.toId) || [];
        bList.push(edge.fromNodeId);
        adjBackward.set(edge.toId, bList);
      }

      // Within-container flows
      for (const node of nodes) {
        const fList = adjForward.get(node.containerId) || [];
        fList.push(node.id);
        adjForward.set(node.containerId, fList);

        const bList = adjBackward.get(node.id) || [];
        bList.push(node.containerId);
        adjBackward.set(node.id, bList);
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

    if (containerLayouts.length === 0) {
      return (
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No matching elements</div>
          <div className="empty-state-desc">
            Try adjusting your visual detail zoom levels to discover execution paths.
          </div>
        </div>
      );
    }

    const handleGhostClick = (ghost: any) => {
      // Dynamically extract the maximum visual level hidden inside the Ghost Span
      let maxLevel = activeLevel;
      ghost.truncatedLineage.forEach((line: string) => {
        const match = line.match(/\(L(\d+)\)/);
        if (match) {
          maxLevel = Math.max(maxLevel, parseInt(match[1], 10));
        }
      });
      onSelectLevel?.(maxLevel);
    };

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

          return (
            <div
              key={cl.containerId}
              className={`container-card${isCausalHighlighted ? " container-card--highlighted" : ""}`}
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
              <div
                className="container-card-header"
                style={{ background: depthColorDim }}
              >
                <div className="container-card-title">
                  <span className="container-card-icon" style={{ color: depthColor }}>
                    {getContainerIcon(cl.type)}
                  </span>
                  <span className="container-card-name" title={cl.name}>
                    {cl.name}
                  </span>
                </div>
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

          return (
            <div
              key={node.id}
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
                contextLabel={(() => {
                  const subContainer = containers.find((c) => c.id === node.containerId);
                  return subContainer && subContainer.id !== container?.containerId ? subContainer.name : undefined;
                })()}
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

          {/* Parent arrows */}
          {parentArrows.map((pa, i) => {
            const fx = pa.fromX + PAD;
            const fy = pa.fromY + PAD;
            const tx = pa.toX + PAD;
            const ty = pa.toY + PAD;
            const dx = tx - fx;
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
              midX = 0.125 * fx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx;
              midY = (fy + ty) / 2;
            }

            const isCausalHighlighted = causalPath
              ? causalPath.activeEdges.has(`${wire.fromNodeId}->${wire.toId}`)
              : hoveredNodeId
              ? wire.fromNodeId === hoveredNodeId || wire.toId === hoveredNodeId
              : false;

            const isCausalDimmedWire = causalPath
              ? !isCausalHighlighted
              : hasActiveHover && !isCausalHighlighted;

            const isDirect = wire.edge.distance === 0;

            let strokeColor = "var(--accent-primary)";
            if (isCausalHighlighted) strokeColor = "var(--accent-secondary)";

            const strokeWidth = isCausalHighlighted ? 2.5 : 1.5;
            const opacity = isCausalHighlighted ? 1 : isCausalDimmedWire ? 0.04 : 0.6;

            const markerEnd = isCausalHighlighted
              ? "url(#arrow-wire-highlight)"
              : "url(#arrow-wire)";

            // ── V4 Ghost Spans Injection ──
            const ghost = ghostSpans?.find(
              (g) => g.fromSpanId === wire.fromNodeId && g.toSpanId === wire.toId
            );

            const showGhost = !!ghost;
            const badgeBg = "rgba(10,12,22,0.92)";
            const badgeBorder = isCausalHighlighted
              ? "var(--accent-secondary)"
              : "hsla(217, 91%, 60%, 0.4)";
            const badgeText = isCausalHighlighted
              ? "var(--accent-secondary)"
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
                  className={isCausalHighlighted ? "wire-active-flow" : ""}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isCausalHighlighted ? undefined : isDirect ? undefined : "6 4"}
                  markerEnd={markerEnd}
                  style={{
                    filter: isCausalHighlighted
                      ? "drop-shadow(0 0 5px var(--accent-primary))"
                      : undefined,
                    transition: "stroke-dashoffset 100ms linear",
                  }}
                />
                
                {/* Visual Ghost Span Badge */}
                {showGhost && (
                  <g
                    style={{ cursor: "pointer", pointerEvents: "auto" }}
                    onClick={() => handleGhostClick(ghost)}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredGhost({
                        ghost,
                        x: rect.left + window.scrollX + rect.width / 2,
                        y: rect.top + window.scrollY - 8,
                      });
                    }}
                    onMouseLeave={() => setHoveredGhost(null)}
                  >
                    <rect
                      x={midX - 45}
                      y={midY - 9}
                      width={90}
                      height={18}
                      rx={9}
                      fill={badgeBg}
                      stroke={badgeBorder}
                      strokeWidth={1}
                      style={{
                        transition: "stroke 180ms ease, fill 180ms ease",
                      }}
                    />
                    <text
                      x={midX}
                      y={midY + 3.5}
                      textAnchor="middle"
                      fill={badgeText}
                      fontSize={8.5}
                      fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      👻 +{ghost.hiddenCount} ({formatDuration(ghost.durationUs)})
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Floating node inspector ── */}
        {selectedNode && (
          <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {/* ── Floating Ghost Tooltip ── */}
        {hoveredGhost && (
          <div
            className="ghost-inspector-tooltip"
            style={{
              position: "absolute",
              left: hoveredGhost.x,
              top: hoveredGhost.y,
              transform: "translate(-50%, -100%)",
              background: "rgba(10, 12, 22, 0.95)",
              border: "1px solid var(--accent-primary)",
              borderRadius: 8,
              padding: "10px 14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.8), 0 0 16px rgba(139, 92, 246, 0.2)",
              backdropFilter: "blur(12px)",
              color: "var(--text-primary)",
              zIndex: 9999,
              pointerEvents: "none",
              width: 260,
              fontFamily: "var(--font-sans)",
            }}
          >
            <div style={{ fontWeight: "700", color: "var(--accent-primary)", fontSize: 12, marginBottom: 6 }}>
              👻 Phantom Detail Capsule (+{hoveredGhost.ghost.hiddenCount} hidden)
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
              Bypassed execution paths taking <strong>{formatDuration(hoveredGhost.ghost.durationUs)}</strong>:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {hoveredGhost.ghost.truncatedLineage.map((name: string, idx: number) => (
                <div key={idx} style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--accent-secondary)", fontSize: 14 }}>•</span>
                  <span>{name}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 8, paddingTop: 6 }}>
              Click this capsule to expand and reveal details.
            </div>
          </div>
        )}
      </div>
    );
  }
);

TraceFlowCanvas.displayName = "TraceFlowCanvas";

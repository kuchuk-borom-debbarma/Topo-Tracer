import { useMemo, forwardRef, useState, useEffect, useRef } from "react";
import type { TraceLayoutResponse } from "../api/client";
import { computeLayout, LAYOUT } from "../utils/layout";
import { BlockCard } from "./BlockCard";

type Props = {
  data: TraceLayoutResponse;
};

export const TraceFlowCanvas = forwardRef<HTMLDivElement, Props>(
  ({ data }, forwardedRef) => {
    const { blocks, nodes, edges } = data;

    const [wrapperWidth, setWrapperWidth] = useState(1200);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
    
    const localRef = useRef<HTMLDivElement | null>(null);

    // Measure parent wrapper dynamically via ResizeObserver
    useEffect(() => {
      const el = localRef.current?.parentElement;
      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setWrapperWidth(entry.contentRect.width);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // Merge forwarded ref and local ref cleanly
    const setRef = (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    // Dynamically expand columns to fill screen width
    const colGap = useMemo(() => {
      const activeZoom = data.metadata.currentDepth;
      const visibleBlocks = blocks.filter((b) => b.absoluteDepth <= activeZoom);
      if (visibleBlocks.length === 0) return 100;

      const maxDepth = Math.max(...visibleBlocks.map((b) => b.absoluteDepth), 0);
      const numCols = maxDepth + 1;
      if (numCols <= 1) return 100;

      // 136px accounts for CANVAS_PAD (48 * 2 = 96) + CONTAINER_PAD (20 * 2 = 40)
      const padOffset = 136;
      const dynamicGap = (wrapperWidth - (numCols * LAYOUT.COL_W) - padOffset) / (numCols - 1);
      
      // Clamp between 60px and 180px for optimal screen balance
      return Math.min(180, Math.max(60, dynamicGap));
    }, [blocks, wrapperWidth, data.metadata.currentDepth]);

    const layout = useMemo(
      () => computeLayout(blocks, nodes, edges, colGap, data.metadata.currentDepth),
      [blocks, nodes, edges, colGap, data.metadata.currentDepth]
    );

    const {
      containerLayouts,
      blockPositions,
      wires,
      canvasWidth,
      canvasHeight,
    } = layout;

    const callingNodeIds = useMemo(() => {
      const s = new Set<string>();
      for (const block of blocks) {
        if (block.callingNodeId) s.add(block.callingNodeId);
      }
      return s;
    }, [blocks]);

    const nodesByBlock = useMemo(() => {
      const map = new Map<string, typeof nodes>();
      for (const node of nodes) {
        if (!map.has(node.blockId)) map.set(node.blockId, []);
        map.get(node.blockId)!.push(node);
      }
      for (const arr of map.values())
        arr.sort((a, b) => a.localSequence - b.localSequence);
      return map;
    }, [nodes]);

    const PAD = LAYOUT.CANVAS_PAD;
    const ARROW_SIZE = 7;

    if (blocks.length === 0) {
      return (
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No blocks at this zoom level</div>
          <div className="empty-state-desc">
            Try increasing the zoom level to see more detail.
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
        {/* ── Container swimlane bands ── */}
        {containerLayouts.map((cl) => (
          <div
            key={cl.containerId}
            className="container-band"
            style={{
              position: "absolute",
              top: cl.top + PAD,
              left: cl.left + PAD,
              width: cl.width,
              height: cl.height,
            }}
          >
            {/* Band header */}
            <div className="container-band-header">
              <span className="container-band-icon">⬡</span>
              <span className="container-band-label">{cl.label}</span>
              <span className="container-band-id">{cl.containerId}</span>
            </div>
          </div>
        ))}

        {/* ── SVG edge wires ── */}
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
            // Apply slight horizontal offsets so paths start and end cleanly outside borders
            const fx = wire.fromX + PAD + 4;
            const fy = wire.fromY + PAD;
            const tx = wire.toX + PAD - 6;
            const ty = wire.toY + PAD;

            const dx = tx - fx;
            const dy = ty - fy;
            const isStraight = Math.abs(dy) < 2;
            let d: string;

            if (isStraight) {
              d = `M ${fx} ${fy} L ${tx} ${ty}`;
            } else {
              // Calculate a beautiful S-curve with flat horizontal shoulders.
              // To prevent parallel overlapping, we dynamically scale the shoulder width
              // based on the vertical distance (dy) and a slight offset using the index.
              const shoulderScale = 0.35 + Math.min(0.2, Math.abs(dy) / 400) + ((i % 3) * 0.03);
              const offset = Math.max(28, dx * shoulderScale);
              const cx1 = fx + offset;
              const cx2 = tx - offset;
              d = `M ${fx} ${fy} C ${cx1} ${fy}, ${cx2} ${ty}, ${tx} ${ty}`;
            }

            const isCross = wire.isCrossContainer;
            
            // Check active hover highlights
            const hasActiveHover = hoveredNodeId !== null || hoveredBlockId !== null;
            const isHighlighted = hoveredNodeId
              ? (wire.fromNodeId === hoveredNodeId || wire.toNodeId === hoveredNodeId)
              : hoveredBlockId
              ? (wire.fromBlockId === hoveredBlockId || wire.toBlockId === hoveredBlockId)
              : false;
            
            const isDimmed = hasActiveHover && !isHighlighted;
            
            let strokeColor = isCross ? "hsla(280, 80%, 70%, 0.9)" : "var(--accent-primary)";
            if (isHighlighted) {
              strokeColor = "var(--accent-secondary)";
            }

            return (
              <path
                key={i}
                d={d}
                className={isCross ? "edge-line edge-line-cross" : "edge-line"}
                style={{
                  stroke: strokeColor,
                  strokeWidth: isHighlighted ? 2.5 : isCross ? 2 : 1.5,
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
            );
          })}
        </svg>

        {/* ── Block cards ── */}
        {Array.from(blockPositions.values()).map(({ block, top, left, height }) => {
          const blockNodes = nodesByBlock.get(block.id) ?? [];
          return (
            <BlockCard
              key={block.id}
              block={block}
              nodes={blockNodes}
              top={top + PAD}
              left={left + PAD}
              height={height}
              callingNodeIds={callingNodeIds}
              hoveredNodeId={hoveredNodeId}
              onNodeHover={setHoveredNodeId}
              onBlockHover={setHoveredBlockId}
            />
          );
        })}
      </div>
    );
  }
);

TraceFlowCanvas.displayName = "TraceFlowCanvas";

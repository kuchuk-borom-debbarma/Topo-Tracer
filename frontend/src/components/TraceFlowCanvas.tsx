import { useMemo, forwardRef } from "react";
import type { TraceLayoutResponse } from "../api/client";
import { computeLayout, LAYOUT } from "../utils/layout";
import { BlockCard } from "./BlockCard";

type Props = {
  data: TraceLayoutResponse;
};

export const TraceFlowCanvas = forwardRef<HTMLDivElement, Props>(
  ({ data }, ref) => {
    const { blocks, nodes, edges } = data;

    const layout = useMemo(
      () => computeLayout(blocks, nodes, edges),
      [blocks, nodes, edges]
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
        ref={ref}
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
          </defs>

          {wires.map((wire, i) => {
            const fx = wire.fromX + PAD;
            const fy = wire.fromY + PAD;
            const tx = wire.toX + PAD;
            const ty = wire.toY + PAD;

            // Straight or cubic bezier
            const isStraight = Math.abs(fy - ty) < 2;
            let d: string;
            if (isStraight) {
              d = `M ${fx} ${fy} L ${tx} ${ty}`;
            } else {
              // For cross-container: use a longer S-curve to visually cross container bands
              const cx1 = fx + (tx - fx) * 0.55;
              const cx2 = tx - (tx - fx) * 0.55;
              d = `M ${fx} ${fy} C ${cx1} ${fy}, ${cx2} ${ty}, ${tx} ${ty}`;
            }

            const isCross = wire.isCrossContainer;
            return (
              <path
                key={i}
                d={d}
                className={isCross ? "edge-line edge-line-cross" : "edge-line"}
                markerEnd={isCross ? "url(#arrowhead-cross)" : "url(#arrowhead)"}
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
            />
          );
        })}
      </div>
    );
  }
);

TraceFlowCanvas.displayName = "TraceFlowCanvas";

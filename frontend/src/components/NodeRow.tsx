import { useState } from "react";
import type { ReadNode } from "../api/client";
import { getNodeColor, formatDuration } from "../utils/layout";

type Props = {
  node: ReadNode;
  isCallingNode: boolean;
  isHovered?: boolean;
  onHover?: (nodeId: string | null) => void;
};

export function NodeRow({ node, isCallingNode, isHovered, onHover }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const color = getNodeColor(node.type);
  const duration = formatDuration(node.durationUs);

  const meta = node.metadata as Record<string, unknown> | null | undefined;
  const hasMetadata = meta && typeof meta === "object" && Object.keys(meta).length > 0;

  return (
    <div
      className={`node-row${isCallingNode ? " is-calling-node" : ""}${isHovered ? " is-hovered" : ""}`}
      data-node-id={node.id}
      onMouseEnter={() => {
        setShowTooltip(true);
        onHover?.(node.id);
      }}
      onMouseLeave={() => {
        setShowTooltip(false);
        onHover?.(null);
      }}
    >
      <div
        className="node-type-dot"
        style={{ background: color, boxShadow: `0 0 6px ${color}88` }}
      />
      <div className="node-row-content">
        <div className="node-row-name" title={node.name}>
          {node.name}
        </div>
        <div className="node-row-meta">
          <span className="node-row-type">{node.type}</span>
          {duration && <span className="node-row-duration">{duration}</span>}
        </div>
      </div>

      {showTooltip && (
        <div className="node-tooltip">
          <div className="node-tooltip-header">
            <span
              className="node-tooltip-dot"
              style={{ background: color }}
            />
            <span className="node-tooltip-type">{node.type}</span>
            {duration && <span className="node-tooltip-duration">{duration}</span>}
          </div>
          <div className="node-tooltip-title">{node.name}</div>
          {hasMetadata && (
            <pre>{JSON.stringify(meta, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

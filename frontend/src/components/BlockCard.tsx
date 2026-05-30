import type { ReadBlock, ReadNode } from "../api/client";
import { NodeRow } from "./NodeRow";

type Props = {
  block: ReadBlock;
  nodes: ReadNode[];
  top: number;
  left: number;
  height: number;
  callingNodeIds: Set<string>;
};

export function BlockCard({ block, nodes, top, left, height, callingNodeIds }: Props) {
  const containerChip = block.containerId.replace(/^container-/, "").slice(0, 16);

  return (
    <div
      className="block-card"
      data-block-id={block.id}
      style={{ top, left, height }}
    >
      <div className="block-card-header">
        <div className="block-card-title" title={block.name}>
          {block.name}
        </div>
        <div className="block-card-meta">
          <span
            className="block-card-container-chip"
            title={block.containerId}
          >
            {containerChip}
          </span>
          <span className="block-card-depth">D{block.absoluteDepth}</span>
        </div>
      </div>

      <div className="block-card-nodes">
        {nodes.length === 0 && (
          <div
            style={{
              padding: "8px",
              fontSize: "11px",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            No visible nodes at this zoom level
          </div>
        )}
        {nodes.map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            isCallingNode={callingNodeIds.has(node.id)}
          />
        ))}
      </div>
    </div>
  );
}

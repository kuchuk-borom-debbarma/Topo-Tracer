import { createPortal } from "react-dom";
import type { ReadNode } from "../api/client";
import { getNodeColor, getNodeTypeLabel, formatDuration } from "../utils/layout";

type Props = {
  node: ReadNode;
  isHovered?: boolean;
  onHover?: (nodeId: string | null) => void;
  onSelect?: (node: ReadNode | null) => void;
  isSelected?: boolean;
};

export function NodeCard({ node, isHovered, onHover, onSelect, isSelected }: Props) {
  const color = getNodeColor(node.type);
  const typeLabel = getNodeTypeLabel(node.type);
  const duration = formatDuration(node.durationUs);
  const tags = node.tags || [];
  const visibleTags = tags.slice(0, 2);
  const extraTagCount = tags.length - 2;

  return (
    <div
      className={`node-card${isHovered ? " node-card--hovered" : ""}${isSelected ? " node-card--selected" : ""}`}
      data-node-id={node.id}
      onMouseEnter={() => onHover?.(node.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onSelect?.(isSelected ? null : node)}
      title={node.name}
    >
      {/* Left: type badge */}
      <span
        className="node-type-badge"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        }}
      >
        {typeLabel}
      </span>

      {/* Center: name + meta row */}
      <div className="node-card-content">
        <div className="node-card-name">{node.name}</div>
        <div className="node-card-footer">
          {duration && <span className="node-card-duration">{duration}</span>}
          {visibleTags.map((tag) => (
            <span key={tag} className="node-card-tag">
              #{tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="node-card-tag node-card-tag--more">
              +{extraTagCount}
            </span>
          )}
        </div>
      </div>

      {/* Right: indicator dot for selected / has metadata */}
      <div
        className="node-card-indicator"
        style={{ background: color }}
        aria-hidden="true"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Floating Inspector Panel (portal to document.body)
   Shown when a node is selected (clicked)
───────────────────────────────────────────────────────── */
type InspectorProps = {
  node: ReadNode;
  onClose: () => void;
};

export function NodeInspector({ node, onClose }: InspectorProps) {
  const color = getNodeColor(node.type);
  const typeLabel = getNodeTypeLabel(node.type);
  const duration = formatDuration(node.durationUs);
  const meta = node.metadata as Record<string, unknown> | null | undefined;
  const hasMetadata = meta && typeof meta === "object" && Object.keys(meta).length > 0;
  const tags = node.tags || [];

  return createPortal(
    <div className="node-inspector-backdrop" onClick={onClose}>
      <div
        className="node-inspector"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTopColor: color }}
      >
        {/* Header */}
        <div className="node-inspector-header">
          <span
            className="node-inspector-badge"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            {typeLabel}
          </span>
          <span className="node-inspector-name">{node.name}</span>
          <button className="node-inspector-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Stats row */}
        <div className="node-inspector-stats">
          {duration && (
            <div className="node-inspector-stat">
              <span className="node-inspector-stat-label">Duration</span>
              <span className="node-inspector-stat-value" style={{ color }}>
                {duration}
              </span>
            </div>
          )}
          <div className="node-inspector-stat">
            <span className="node-inspector-stat-label">Type</span>
            <span className="node-inspector-stat-value">{node.type}</span>
          </div>
          {node.localSequence !== undefined && (
            <div className="node-inspector-stat">
              <span className="node-inspector-stat-label">Sequence</span>
              <span className="node-inspector-stat-value">#{node.localSequence}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="node-inspector-section">
            <div className="node-inspector-section-label">Tags</div>
            <div className="node-inspector-tags">
              {tags.map((tag) => (
                <span key={tag} className="node-inspector-tag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {hasMetadata && (
          <div className="node-inspector-section">
            <div className="node-inspector-section-label">Metadata</div>
            <pre className="node-inspector-meta">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}

        {/* Node ID */}
        <div className="node-inspector-section">
          <div className="node-inspector-section-label">Node ID</div>
          <div className="node-inspector-id">{node.id}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Keep backward-compat export alias
export { NodeCard as NodeRow };

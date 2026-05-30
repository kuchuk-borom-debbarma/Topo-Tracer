import React from 'react';
import { 
  Server, 
  Network, 
  Database, 
  Code, 
  Cpu, 
  Radio,
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  Folder,
  FolderOpen,
  Boxes,
  Sliders,
  GitCommit
} from 'lucide-react';
import type { ReadBlock, ReadNode } from '../services/api';
import { getContainerStyle, getNodeColor } from '../utils/styleUtils';

interface TraceTreeProps {
  nodes: ReadNode[];
  blocks: ReadBlock[];
  selectedNode: ReadNode | null;
  onSelectNode: (node: ReadNode) => void;
  collapsedNodeIds: Set<string>;
  toggleCollapseNode: (id: string) => void;
  depth: number;
  setDepth: (d: number) => void;
  maxDepth: number;
}

type RenderItem = 
  | { type: 'block_header'; block: ReadBlock; depth: number; collapsed: boolean; childCount: number }
  | { type: 'node'; node: ReadNode; depth: number };

export const TraceTree: React.FC<TraceTreeProps> = ({
  nodes,
  blocks,
  selectedNode,
  onSelectNode,
  collapsedNodeIds,
  toggleCollapseNode,
  depth,
  setDepth,
  maxDepth
}) => {
  // 1. Build parentage maps to efficiently identify hierarchy
  const { blockIdToNodes, callingNodeToBlocks } = React.useMemo(() => {
    const bToNodes = new Map<string, ReadNode[]>();
    nodes.forEach(node => {
      if (!bToNodes.has(node.blockId)) bToNodes.set(node.blockId, []);
      bToNodes.get(node.blockId)!.push(node);
    });

    const cToBlocks = new Map<string, ReadBlock[]>();
    blocks.forEach(block => {
      if (block.callingNodeId) {
        if (!cToBlocks.has(block.callingNodeId)) cToBlocks.set(block.callingNodeId, []);
        cToBlocks.get(block.callingNodeId)!.push(block);
      }
    });

    return { blockIdToNodes: bToNodes, callingNodeToBlocks: cToBlocks };
  }, [nodes, blocks]);

  // 2. Perform DFS to build chronological render items with nested functional blocks
  const { renderItems, traceStartTime, totalTraceDuration } = React.useMemo(() => {
    const result: RenderItem[] = [];
    const visitedBlocks = new Set<string>();
    const visitedNodes = new Set<string>();

    // Find trace timing context for relative duration bars
    const times = nodes.map(n => n.startTimeUs);
    const endTimes = nodes.map(n => n.startTimeUs + (n.durationUs || 0));
    
    const startTime = times.length > 0 ? Math.min(...times) : 0;
    const endTime = endTimes.length > 0 ? Math.max(...endTimes) : 0;
    const duration = endTime - startTime || 1;

    const dfsBlock = (block: ReadBlock, blockDepth: number) => {
      if (visitedBlocks.has(block.id)) return;
      visitedBlocks.add(block.id);

      const blockNodes = blockIdToNodes.get(block.id) || [];
      // Sort nodes inside this block by chronological sequence
      blockNodes.sort((a, b) => a.localSequence - b.localSequence);

      const isCollapsed = collapsedNodeIds.has(block.id);

      result.push({
        type: 'block_header',
        block,
        depth: blockDepth,
        collapsed: isCollapsed,
        childCount: blockNodes.length
      });

      if (!isCollapsed) {
        blockNodes.forEach(node => {
          if (visitedNodes.has(node.id)) return;
          visitedNodes.add(node.id);

          result.push({
            type: 'node',
            node,
            depth: blockDepth + 1
          });

          // Check if this node triggers any nested blocks
          const subBlocks = callingNodeToBlocks.get(node.id) || [];
          subBlocks.sort((a, b) => a.startTimeUs - b.startTimeUs);
          subBlocks.forEach(subBlock => {
            dfsBlock(subBlock, blockDepth + 2); // Indent nested blocks deeper
          });
        });
      }
    };

    // Begin with root blocks (parentBlockId is empty, or absoluteDepth is 0)
    const rootBlocks = blocks.filter(b => !b.parentBlockId || b.absoluteDepth === 0);
    rootBlocks.sort((a, b) => a.startTimeUs - b.startTimeUs);
    rootBlocks.forEach(rb => dfsBlock(rb, 0));

    // Catch orphan blocks that might be detached due to trace anomalies
    blocks.forEach(b => {
      if (!visitedBlocks.has(b.id)) {
        dfsBlock(b, b.absoluteDepth * 2);
      }
    });

    return { renderItems: result, traceStartTime: startTime, totalTraceDuration: duration };
  }, [blocks, nodes, blockIdToNodes, callingNodeToBlocks, collapsedNodeIds]);

  // Helper to color latency bar based on SLA
  const getLatencyColor = (durationMs: number) => {
    if (durationMs < 50) return 'var(--accent-green)';
    if (durationMs < 250) return 'var(--accent-teal)';
    if (durationMs < 750) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  };

  // Helper to return icon matching node type
  const getNodeIcon = (type: string, isError: boolean) => {
    const size = 15;
    if (isError) return <AlertCircle size={size} style={{ color: 'var(--accent-red)' }} />;
    
    switch (type) {
      case 'http_server':
      case 'express_api':
        return <Server size={size} style={{ color: 'var(--accent-green)' }} />;
      case 'http_client':
        return <Network size={size} style={{ color: 'var(--accent-blue)' }} />;
      case 'database':
      case 'db':
        return <Database size={size} style={{ color: 'var(--accent-teal)' }} />;
      case 'pubsub':
      case 'queue':
      case 'kafka_consumer':
        return <Radio size={size} style={{ color: 'var(--accent-orange)' }} />;
      case 'function':
        return <Code size={size} style={{ color: 'var(--accent-purple)' }} />;
      default:
        return <Cpu size={size} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          Indented Tree Explorer
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '99px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {renderItems.filter(i => i.type === 'node').length} spans
          </span>
        </h2>

        {/* Embedded Sliders controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Sliders size={12} />
              Resolution
            </label>
            <input
              type="range"
              min="0"
              max={maxDepth}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              style={{
                width: '120px',
                accentColor: 'var(--accent-blue)',
                height: '3px',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', minWidth: '24px' }}>
              {depth}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '600px', paddingRight: '0.5rem' }} className="tree-container">
        {renderItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
            <Cpu size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '0.875rem' }}>No trace spans visible at this depth resolution.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Try adjusting the zoom slider.</p>
          </div>
        ) : (
          renderItems.map(item => {
            if (item.type === 'block_header') {
              const { block } = item;
              const isCollapsed = item.collapsed;
              const blockDepth = item.depth;
              const durationMs = block.durationUs ? block.durationUs / 1000 : 0;
              const containerStyle = getContainerStyle(block.containerId);

              return (
                <div
                  key={block.id}
                  className={`tree-node-row depth-${blockDepth}`}
                  style={{
                    '--depth': blockDepth,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.005) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderLeft: `4px solid ${containerStyle.base}`,
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    marginBottom: '0.35rem',
                    marginTop: '0.25rem',
                    position: 'relative',
                    backdropFilter: 'blur(8px)',
                    boxShadow: `0 0 10px ${containerStyle.base}11`,
                    transition: 'all 0.15s ease',
                    zIndex: 5
                  } as React.CSSProperties}
                  onClick={() => toggleCollapseNode(block.id)}
                >
                  {/* Connector vertical guidelines */}
                  {Array.from({ length: blockDepth }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `calc(${idx} * 32px + 16px)`,
                        top: 0,
                        bottom: 0,
                        width: '1px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        pointerEvents: 'none'
                      }}
                    />
                  ))}

                  <div 
                    style={{ 
                      marginLeft: `calc(${blockDepth} * 32px)`,
                      display: 'flex',
                      alignItems: 'center',
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    {/* Folder chevron toggle trigger */}
                    <div 
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginRight: '0.4rem',
                        color: containerStyle.base,
                        zIndex: 2
                      }}
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {/* Group Icon */}
                    <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: containerStyle.base }}>
                      {isCollapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
                    </div>

                    {/* Logical Group Label Badge */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span 
                        style={{
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {block.name}
                      </span>
                      <span 
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-muted)',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {block.type}
                      </span>
                    </div>
                  </div>

                  {/* Duration timer */}
                  {durationMs > 0 && (
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.25rem' }}>
                      {durationMs.toFixed(1)}ms
                    </span>
                  )}
                </div>
              );
            }

            // Otherwise, render a standard Node item
            const { node } = item;
            const nodeDepth = item.depth;
            
            // Time Duration Calculations (convert microseconds to milliseconds)
            const totalDuration = node.durationUs ? node.durationUs / 1000 : 0;
            const isSelected = selectedNode?.id === node.id;
            const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || (node.metadata.status >= 400)));
            const nodeColor = getNodeColor(node.type, isError);

            return (
              <div
                key={node.id}
                className={`tree-node-row depth-${nodeDepth}`}
                style={{
                  '--depth': nodeDepth,
                  display: 'flex',
                  alignItems: 'center',
                  background: isSelected ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                  border: isSelected ? `1px solid ${nodeColor}` : '1px solid transparent',
                  borderLeft: isSelected ? `4px solid ${nodeColor}` : '1px solid transparent',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  marginBottom: '0.1rem',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  boxShadow: isSelected ? `0 0 10px ${nodeColor}22` : 'none'
                } as React.CSSProperties}
                onClick={() => onSelectNode(node)}
              >
                {/* Connector vertical guidelines */}
                {Array.from({ length: nodeDepth }).map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `calc(${idx} * 32px + 16px)`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      pointerEvents: 'none'
                    }}
                  />
                ))}

                {/* Horizontal connector "L" branch */}
                {nodeDepth > 0 && (
                  <div 
                    style={{
                      position: 'absolute',
                      left: `calc(${(nodeDepth - 1)} * 32px + 16px)`,
                      top: '50%',
                      width: '16px',
                      height: '1px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      pointerEvents: 'none'
                    }}
                  />
                )}

                <div 
                  style={{ 
                    marginLeft: `calc(${nodeDepth} * 32px)`,
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0
                  }}
                >
                  {/* Leaf spacing offset */}
                  <div style={{ width: '20px', marginRight: '0.25rem' }} />

                  {/* Styled Type Icon */}
                  <div style={{ marginRight: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getNodeIcon(node.type, isError)}
                  </div>

                  {/* Node Metadata Summary Info */}
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span 
                        style={{ 
                          fontWeight: 600, 
                          fontSize: '0.875rem', 
                          color: isError ? 'var(--accent-red)' : 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '260px'
                        }}
                        title={node.name}
                      >
                        {node.name}
                      </span>

                      {/* Container Scope Badge */}
                      <span 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.2rem',
                          fontSize: '0.7rem', 
                          background: 'rgba(255,255,255,0.04)', 
                          border: '1px solid rgba(255,255,255,0.06)',
                          padding: '0.1rem 0.4rem', 
                          borderRadius: '4px',
                          color: 'var(--text-secondary)' 
                        }}
                      >
                        <Boxes size={10} style={{ color: 'var(--accent-blue)' }} />
                        Layer {node.zoomLevel}
                      </span>
                    </div>
                    
                    {/* Subtle Subtitle Details */}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      <span style={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700, color: nodeColor }}>
                        {node.type.replace('_', ' ')}
                      </span>
                      <span>•</span>
                      <span>Seq {node.localSequence}</span>
                    </div>
                  </div>
                </div>

                {/* Timeline Visualization */}
                <div 
                  style={{ 
                    width: '180px',
                    height: '24px',
                    position: 'relative',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={`Start: +${Math.round((node.startTimeUs - traceStartTime) / 1000)}ms | Duration: ${totalDuration.toFixed(2)}ms`}
                >
                  <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />
                  <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />

                  {/* Relative duration bar */}
                  {(() => {
                    const relativeStart = ((node.startTimeUs - traceStartTime) / totalTraceDuration) * 100;
                    const relativeWidth = ((node.durationUs || 0) / totalTraceDuration) * 100;

                    return (
                      <div 
                        style={{ 
                          position: 'absolute',
                          left: `${Math.max(0, Math.min(99, relativeStart))}%`,
                          width: `${Math.max(1, Math.min(100 - relativeStart, relativeWidth))}%`,
                          height: '8px',
                          display: 'flex',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          background: nodeColor,
                          boxShadow: `0 0 8px ${nodeColor}44`
                        }}
                      />
                    );
                  })()}

                  {/* Latency Label */}
                  <div style={{ position: 'absolute', right: '4px', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: getLatencyColor(totalDuration), textShadow: '0 0 4px rgba(0,0,0,0.5)' }}>
                    {totalDuration > 0 ? `${totalDuration.toFixed(1)}ms` : '0ms'}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
export default TraceTree;

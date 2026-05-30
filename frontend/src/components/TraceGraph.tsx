import React from 'react';
import { Network, Info, Download, Loader2, Sliders } from 'lucide-react';
import type { ReadBlock, ReadNode, ReadEdge } from '../services/api';
import { getContainerStyle, getNodeColor, getEdgeStyle } from '../utils/styleUtils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface TraceGraphProps {
  nodes: ReadNode[];
  blocks: ReadBlock[];
  edges: ReadEdge[];
  selectedNode: ReadNode | null;
  onSelectNode: (node: ReadNode) => void;
  depth: number;
  setDepth: (d: number) => void;
  maxDepth: number;
}

export const TraceGraph: React.FC<TraceGraphProps> = ({
  nodes,
  blocks,
  edges = [],
  selectedNode,
  onSelectNode,
  depth,
  setDepth,
  maxDepth
}) => {
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = React.useState(false);

  // 1. Visible maps for O(1) dynamic edge snapping
  const visibleBlocks = React.useMemo(() => new Set(blocks.map(b => b.id)), [blocks]);
  const visibleNodes = React.useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);

  // 2. Coordinate mapper with deterministic Block Waterfall positioning
  const layout = React.useMemo(() => {
    const coords: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const nodeCoords: Record<string, { x: number; y: number; width: number }> = {};

    // Group nodes inside each block
    const blockIdToNodes = new Map<string, ReadNode[]>();
    nodes.forEach(node => {
      if (!blockIdToNodes.has(node.blockId)) blockIdToNodes.set(node.blockId, []);
      blockIdToNodes.get(node.blockId)!.push(node);
    });
    blockIdToNodes.forEach(bNodes => {
      bNodes.sort((a, b) => a.localSequence - b.localSequence);
    });

    // Layout tracker to avoid overlaps at each absoluteDepth level
    const nextYAtDepth: Record<number, number> = {};

    // Block dimensions
    const blockWidth = 260;
    const headerHeight = 35;
    const nodeHeightHeight = 55;
    const bottomPadding = 15;

    // DFS positioning
    const positionBlock = (block: ReadBlock, parentCallingNodeY: number) => {
      const bNodes = blockIdToNodes.get(block.id) || [];
      const numNodes = bNodes.length;

      // X position is purely determined by the block's absolute depth
      const x = 50 + block.absoluteDepth * 320;

      // Y position aligns with parent calling node or slides down if overlap occurs
      const currentNextY = nextYAtDepth[block.absoluteDepth] || 60;
      const y = Math.max(parentCallingNodeY, currentNextY);

      // Compute block height
      const h = headerHeight + numNodes * nodeHeightHeight + bottomPadding;

      coords[block.id] = { x, y, w: blockWidth, h };
      nextYAtDepth[block.absoluteDepth] = y + h + 25; // 25px vertical spacing

      // Stack child nodes vertically inside block
      let currentSeqY = y + headerHeight;
      bNodes.forEach((node) => {
        const nodeY = currentSeqY + nodeHeightHeight / 2 - 8;
        const nodeWidth = blockWidth - 24;
        nodeCoords[node.id] = {
          x: x + 12 + nodeWidth / 2, // Centered inside block
          y: nodeY,
          width: nodeWidth
        };
        currentSeqY += nodeHeightHeight;

        // Position nested blocks triggered by this node
        const childBlocks = blocks.filter(b => b.callingNodeId === node.id);
        childBlocks.sort((a, b) => a.startTimeUs - b.startTimeUs);
        childBlocks.forEach(cb => {
          positionBlock(cb, nodeY);
        });
      });
    };

    // Position root blocks
    const rootBlocks = blocks.filter(b => !b.parentBlockId || b.absoluteDepth === 0);
    rootBlocks.sort((a, b) => a.startTimeUs - b.startTimeUs);
    rootBlocks.forEach(rb => {
      positionBlock(rb, 60);
    });

    // Position any orphan blocks
    blocks.forEach(b => {
      if (!coords[b.id]) {
        positionBlock(b, 60);
      }
    });

    return { coords, nodeCoords };
  }, [nodes, blocks]);

  // 3. Dynamic Snapping logic to find closest visible ancestor
  const resolveSnappedEndpoint = React.useCallback((
    nodeId: string, 
    ancestryPath: string[] | undefined
  ): { id: string; type: 'node' | 'block' } | null => {
    if (visibleNodes.has(nodeId)) {
      return { id: nodeId, type: 'node' };
    }

    if (ancestryPath && ancestryPath.length > 0) {
      // Loop backwards from leaf to root
      for (let i = ancestryPath.length - 1; i >= 0; i--) {
        const ancestorId = ancestryPath[i];
        if (visibleNodes.has(ancestorId)) {
          return { id: ancestorId, type: 'node' };
        }
        if (visibleBlocks.has(ancestorId)) {
          return { id: ancestorId, type: 'block' };
        }
      }
    }

    if (blocks.length > 0) {
      return { id: blocks[0].id, type: 'block' };
    }
    return null;
  }, [visibleNodes, visibleBlocks, blocks]);

  // 4. Generate high-fidelity vector PDF of the waterfall diagram
  const handleExportPDF = async () => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    try {
      const element = canvasRef.current;
      
      // Store original scroll and styling states
      const originalScrollLeft = element.scrollLeft;
      const originalScrollTop = element.scrollTop;
      const originalWidth = element.style.width;
      const originalHeight = element.style.height;
      const originalOverflow = element.style.overflow;
      
      // Force element to fully expand its boundary size so html2canvas renders the whole canvas
      element.style.width = 'auto';
      element.style.height = 'auto';
      element.style.overflow = 'visible';
      
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#05070c', // Harmonious slate dark theme
        scale: 2, // 2x supersampling for razor sharp vector elements
        logging: false
      });
      
      // Restore styling states
      element.style.width = originalWidth;
      element.style.height = originalHeight;
      element.style.overflow = originalOverflow;
      element.scrollLeft = originalScrollLeft;
      element.scrollTop = originalScrollTop;

      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = canvas.width;
      const pdfHeight = canvas.height;
      const orientation = pdfWidth > pdfHeight ? 'l' : 'p';
      
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [pdfWidth, pdfHeight]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`topo-tracer-waterfall-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to export high fidelity PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Find canvas dimensions
  const svgWidth = React.useMemo(() => {
    const maxX = Math.max(...Object.values(layout.coords).map(c => c.x + c.w + 100), 1000);
    return maxX;
  }, [layout]);

  const svgHeight = React.useMemo(() => {
    const maxY = Math.max(...Object.values(layout.coords).map(c => c.y + c.h + 100), 600);
    return maxY;
  }, [layout]);

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Canvas Header Control Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          <Network size={16} style={{ color: 'var(--accent-purple)' }} />
          Waterfall Architecture Topology Canvas
        </h2>
        
        {/* Actions Deck */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {/* Zoom Slider (Embedded) */}
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

          <div style={{ width: '1px', height: '16px', background: 'var(--glass-border)' }} />

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Info size={12} />
            Auto-snapping
          </span>

          <button
            onClick={handleExportPDF}
            disabled={isExporting || nodes.length === 0}
            className="glow-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              height: '32px',
              padding: '0 0.85rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.2) 0%, rgba(96, 165, 250, 0.2) 100%)',
              border: '1px solid rgba(167, 139, 250, 0.4)',
              cursor: isExporting ? 'not-allowed' : 'pointer'
            }}
          >
            {isExporting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Exporting PDF...
              </>
            ) : (
              <>
                <Download size={13} />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div 
        ref={canvasRef}
        style={{ 
          flex: 1, 
          position: 'relative', 
          background: '#05070c', 
          borderRadius: 'var(--radius-md)', 
          border: '1px solid rgba(255,255,255,0.03)', 
          minHeight: '480px', 
          overflow: 'auto' 
        }}
      >
        
        {nodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-muted)' }}>
            <Network size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '0.875rem' }}>No topology data loaded.</p>
          </div>
        ) : (
          <svg 
            width={svgWidth}
            height={svgHeight}
            style={{ display: 'block', background: '#05070c' }}
          >
            {/* Defs block containing glowing graphics and arrows */}
            <defs>
              <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-pink" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <marker id="arrow-pink" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent-pink)" />
              </marker>
              <marker id="arrow-pink-start" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 10 1 L 0 5 L 10 9 z" fill="var(--accent-pink)" />
              </marker>
            </defs>

            {/* 1. Draw connecting dynamic snapped wires (ReadEdges) */}
            {edges.map((edge, idx) => {
              // Retrieve source and target nodes from overall collection (both visible and hidden)
              const resolvedSrc = resolveSnappedEndpoint(edge.fromNodeId, undefined);
              const resolvedDst = resolveSnappedEndpoint(edge.toNodeId, undefined);

              if (!resolvedSrc || !resolvedDst) return null;

              let fromX = 0, fromY = 0, toX = 0, toY = 0;

              // Compute source link coordinates
              if (resolvedSrc.type === 'node') {
                const pt = layout.nodeCoords[resolvedSrc.id];
                if (pt) {
                  const halfWidth = pt.width / 2;
                  fromX = pt.x + halfWidth;
                  fromY = pt.y;
                }
              } else {
                const c = layout.coords[resolvedSrc.id];
                if (c) {
                  fromX = c.x + c.w;
                  fromY = c.y + c.h / 2;
                }
              }

              // Compute target link coordinates
              if (resolvedDst.type === 'node') {
                const pt = layout.nodeCoords[resolvedDst.id];
                if (pt) {
                  const halfWidth = pt.width / 2;
                  toX = pt.x - halfWidth;
                  toY = pt.y;
                }
              } else {
                const c = layout.coords[resolvedDst.id];
                if (c) {
                  toX = c.x;
                  toY = c.y + c.h / 2;
                }
              }

              if (fromX === 0 || toX === 0) return null;

              const dx = Math.abs(toX - fromX) * 0.5;
              const pathStr = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

              // Compute centered marker label RTT (mock delay simulation)
              const midX = (fromX + toX) / 2;
              const midY = (fromY + toY) / 2;
              
              // Calculate latency mock tags based on edge index
              const rttMs = 15 + (idx * 22) % 45;

              return (
                <g key={edge.id || idx}>
                  {/* Neon shadow vector backing */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="rgba(244, 114, 182, 0.15)"
                    strokeWidth="5"
                    filter="url(#glow-pink)"
                  />
                  {/* Active SVG wire */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="var(--accent-pink)"
                    strokeWidth="2"
                    markerEnd="url(#arrow-pink)"
                    style={{ transition: 'all 0.3s ease' }}
                  />
                  {/* Flowing animated package particle */}
                  <circle r="3" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 4px var(--accent-pink))' }}>
                    <animateMotion dur="3s" repeatCount="indefinite" path={pathStr} />
                  </circle>

                  {/* RTT Delay indicator badge pill */}
                  <g transform={`translate(${midX}, ${midY})`} style={{ cursor: 'help' }}>
                    <rect
                      x="-35"
                      y="-8"
                      width="70"
                      height="16"
                      rx="4"
                      fill="rgba(5, 7, 12, 0.9)"
                      stroke="rgba(244, 114, 182, 0.4)"
                      strokeWidth="1"
                    />
                    <text
                      y="3"
                      fill="var(--accent-pink)"
                      fontSize="8"
                      fontWeight="700"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {`⚡ ${rttMs}ms`}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* 2. Draw execution blocks as modular waterfall lanes */}
            {blocks.map((block) => {
              const c = layout.coords[block.id];
              if (!c) return null;

              const containerStyle = getContainerStyle(block.containerId);

              return (
                <g key={block.id}>
                  {/* Glassmorphic block container bounding box */}
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx="10"
                    fill={containerStyle.bgTint}
                    stroke={containerStyle.border}
                    strokeWidth="1.2"
                    style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.45))' }}
                  />

                  {/* Header bar background */}
                  <rect
                    x={c.x + 1}
                    y={c.y + 1}
                    width={c.w - 2}
                    height="24"
                    rx="9"
                    fill="rgba(255, 255, 255, 0.02)"
                  />
                  <line
                    x1={c.x}
                    y1={c.y + 24}
                    x2={c.x + c.w}
                    y2={c.y + 24}
                    stroke={containerStyle.border}
                    strokeWidth="0.8"
                    strokeOpacity="0.5"
                  />

                  {/* Header title text */}
                  <text
                    x={c.x + 10}
                    y={c.y + 16}
                    fill={containerStyle.base}
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="var(--font-display)"
                    letterSpacing="0.04em"
                  >
                    {block.name.toUpperCase()}
                  </text>

                  {/* Type identifier scope label */}
                  <text
                    x={c.x + c.w - 10}
                    y={c.y + 16}
                    fill="var(--text-muted)"
                    fontSize="7.5"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                    textAnchor="end"
                  >
                    {block.type.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* 3. Draw sorted sequential nodes inside their respective block lanes */}
            {nodes.map((node) => {
              const pt = layout.nodeCoords[node.id];
              if (!pt) return null;

              const nWidth = pt.width || 236;
              const halfWidth = nWidth / 2;

              const isSelected = selectedNode?.id === node.id;
              const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || (node.metadata.status >= 400)));
              const nodeColor = getNodeColor(node.type, isError);

              const totalDuration = node.durationUs ? node.durationUs / 1000 : 0;

              return (
                <g 
                  key={node.id} 
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectNode(node)}
                >
                  {/* Glowing selection aura ring */}
                  {isSelected && (
                    <rect
                      x={pt.x - halfWidth - 4}
                      y={pt.y - 18}
                      width={nWidth + 8}
                      height="36"
                      rx="7"
                      fill="rgba(59, 130, 246, 0.05)"
                      stroke="var(--accent-blue)"
                      strokeWidth="1.5"
                      filter="url(#glow-purple)"
                    />
                  )}

                  {/* Node container body */}
                  <rect
                    x={pt.x - halfWidth}
                    y={pt.y - 15}
                    width={nWidth}
                    height="30"
                    rx="5"
                    fill="rgba(5, 7, 12, 0.85)"
                    stroke={isSelected ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.06)'}
                    strokeWidth="1"
                  />

                  {/* Left tag boundary color marker */}
                  <rect
                    x={pt.x - halfWidth}
                    y={pt.y - 15}
                    width="4"
                    height="30"
                    rx="1.5"
                    fill={nodeColor}
                  />

                  {/* Name label */}
                  <text
                    x={pt.x - halfWidth + 10}
                    y={pt.y}
                    fill={isSelected ? '#ffffff' : 'var(--text-primary)'}
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="var(--font-sans)"
                  >
                    {node.name.length > 25 ? `${node.name.substring(0, 22)}...` : node.name}
                  </text>

                  {/* timing label metadata */}
                  <text
                    x={pt.x - halfWidth + 10}
                    y={pt.y + 10}
                    fill="var(--text-secondary)"
                    fontSize="7"
                    fontWeight="500"
                    fontFamily="var(--font-mono)"
                  >
                    {totalDuration > 0 ? `⏱️ ${totalDuration.toFixed(1)}ms` : '⏱️ instant'}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

      </div>
    </div>
  );
};
export default TraceGraph;

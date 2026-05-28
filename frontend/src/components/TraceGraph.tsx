import React from 'react';
import { Network, Info } from 'lucide-react';
import type { TraceNode, VisualWire } from '../services/api';


interface TraceGraphProps {
  nodes: TraceNode[];
  wires: VisualWire[];
  selectedNode: TraceNode | null;
  onSelectNode: (node: TraceNode) => void;
  depthType: 'global' | 'local';
}

export const TraceGraph: React.FC<TraceGraphProps> = ({
  nodes,
  wires,
  selectedNode,
  onSelectNode,
  depthType
}) => {
  // Map containers and their children nodes
  const containersMap = React.useMemo(() => {
    const map = new Map<string, TraceNode[]>();
    nodes.forEach(n => {
      if (!map.has(n.containerId)) map.set(n.containerId, []);
      map.get(n.containerId)!.push(n);
    });
    return map;
  }, [nodes]);

  const containerIds = Array.from(containersMap.keys());

  // Simple coordinate mapper for a beautiful responsive visual grid
  const layout = React.useMemo(() => {
    const coords: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const nodeCoords: Record<string, { x: number; y: number }> = {};
    
    // Position containers horizontally
    containerIds.forEach((cId, index) => {
      const containerNodes = containersMap.get(cId) || [];
      const x = 50 + index * 300;
      const y = 60;
      const w = 260;
      const h = Math.max(120, 50 + containerNodes.length * 60);
      
      coords[cId] = { x, y, w, h };

      // Position individual nodes vertically inside their parent container with depth-based indentation
      containerNodes.forEach((node, nodeIdx) => {
        const nodeDepth = depthType === 'local' ? node.localDepthIndex : node.depthIndex;
        nodeCoords[node.id] = {
          x: x + 95 + (nodeDepth * 14),
          y: y + 55 + nodeIdx * 60
        };
      });
    });

    return { coords, nodeCoords };
  }, [containerIds, containersMap, depthType]);

  const svgWidth = Math.max(800, 100 + containerIds.length * 300);
  const svgHeight = Math.max(400, Math.max(...Object.values(layout.coords).map(c => c.y + c.h + 40), 0));


  return (
    <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          <Network size={16} style={{ color: 'var(--accent-purple)' }} />
          Snapped Trace Topology Canvas
        </h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          <Info size={12} />
          Click elements to inspect
        </span>
      </div>

      <div style={{ flex: 1, position: 'relative', background: 'rgba(5, 7, 12, 0.4)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.03)', minHeight: '380px', overflow: 'auto' }}>
        
        {nodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-muted)' }}>
            <Network size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '0.875rem' }}>No topology data loaded.</p>
          </div>
        ) : (
          <svg 
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '580px', margin: 'auto' }}
          >


            {/* Define neon drop shadow glowing filters */}
            <defs>
              <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-pink" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent-blue)" />
              </marker>
              <marker id="arrow-pink" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent-pink)" />
              </marker>
            </defs>

            {/* 1. Draw Network Connections (Visual Wires) */}
            {wires.map((wire, idx) => {
              let fromX = 0, fromY = 0, toX = 0, toY = 0;
              
              // Resolve source coordinates
              if (wire.fromTarget.type === 'node') {
                const pt = layout.nodeCoords[wire.fromTarget.id];
                if (pt) { fromX = pt.x; fromY = pt.y; }
              } else {
                const c = layout.coords[wire.fromTarget.id];
                if (c) { fromX = c.x + c.w; fromY = c.y + c.h / 2; }
              }

              // Resolve target coordinates
              if (wire.toTarget.type === 'node') {
                const pt = layout.nodeCoords[wire.toTarget.id];
                if (pt) { toX = pt.x; toY = pt.y; }
              } else {
                const c = layout.coords[wire.toTarget.id];
                if (c) { toX = c.x; toY = c.y + c.h / 2; }
              }

              if (fromX === 0 || toX === 0) return null;

              // Draw flowing, curved cubic Bezier lines
              const dx = Math.abs(toX - fromX) * 0.5;
              const pathStr = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

              return (
                <g key={wire.id || idx}>
                  {/* Glowing blurred background line */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="rgba(236, 72, 153, 0.15)"
                    strokeWidth="5"
                    filter="url(#glow-pink)"
                  />
                  {/* Core vector wire */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="var(--accent-pink)"
                    strokeWidth="2"
                    markerEnd="url(#arrow-pink)"
                    strokeDasharray={wire.fromTarget.type === 'container' ? "4 4" : undefined}
                    style={{ transition: 'all 0.3s ease' }}
                  />
                  {/* Pulsing micro-animated packet */}
                  <circle r="3" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 4px var(--accent-pink))' }}>
                    <animateMotion dur="2.5s" repeatCount="indefinite" path={pathStr} />
                  </circle>
                </g>
              );
            })}

            {/* 2. Draw Internal Flow (Parentage hierarchy inside same container) */}
            {nodes.map((node) => {
              if (!node.parentNodeId) return null;
              
              const parentNode = nodes.find(p => p.id === node.parentNodeId);
              if (!parentNode || parentNode.containerId !== node.containerId) return null;

              const parentPt = layout.nodeCoords[node.parentNodeId];
              const childPt = layout.nodeCoords[node.id];

              if (!parentPt || !childPt) return null;

              return (
                <g key={`int-${node.id}`}>
                  <line
                    x1={parentPt.x}
                    y1={parentPt.y}
                    x2={childPt.x}
                    y2={childPt.y}
                    stroke="var(--glass-border)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                </g>
              );
            })}

            {/* 3. Draw Containers */}
            {containerIds.map((cId) => {
              const c = layout.coords[cId];
              if (!c) return null;
              return (
                <g key={cId}>
                  {/* Container bounding box */}
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx="12"
                    fill="rgba(13, 20, 35, 0.45)"
                    stroke="rgba(255, 255, 255, 0.04)"
                    strokeWidth="1"
                    style={{ backdropFilter: 'blur(10px)', transition: 'all 0.3s' }}
                  />
                  
                  {/* Container title bar banner */}
                  <rect
                    x={c.x + 1}
                    y={c.y + 1}
                    width={c.w - 2}
                    height="32"
                    rx="11"
                    fill="rgba(255, 255, 255, 0.02)"
                  />
                  <line
                    x1={c.x}
                    y1={c.y + 32}
                    x2={c.x + c.w}
                    y2={c.y + 32}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                  />
                  
                  {/* Container label */}
                  <text
                    x={c.x + 12}
                    y={c.y + 21}
                    fill="var(--text-secondary)"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="var(--font-display)"
                    letterSpacing="0.05em"
                  >
                    {cId.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* 4. Draw Individual Nodes inside Containers */}
            {nodes.map((node) => {
              const pt = layout.nodeCoords[node.id];
              if (!pt) return null;

              const isSelected = selectedNode?.id === node.id;
              const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || (node.metadata.status >= 400)));
              
              // Node color resolver
              let nodeColor = 'var(--accent-purple)';
              if (isError) nodeColor = 'var(--accent-red)';
              else if (node.nodeType === 'http_server') nodeColor = 'var(--accent-green)';
              else if (node.nodeType === 'http_client') nodeColor = 'var(--accent-blue)';
              else if (node.nodeType === 'database') nodeColor = 'var(--accent-teal)';
              else if (node.nodeType === 'pubsub' || node.nodeType === 'queue') nodeColor = 'var(--accent-orange)';

              return (
                <g 
                  key={node.id} 
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectNode(node)}
                >
                  {/* Glowing background ring if selected */}
                  {isSelected && (
                    <rect
                      x={pt.x - 90}
                      y={pt.y - 20}
                      width="180"
                      height="40"
                      rx="8"
                      fill="rgba(59, 130, 246, 0.05)"
                      stroke="var(--accent-blue)"
                      strokeWidth="1.5"
                      filter="url(#glow-blue)"
                    />
                  )}

                  {/* Node solid body */}
                  <rect
                    x={pt.x - 85}
                    y={pt.y - 15}
                    width="170"
                    height="30"
                    rx="6"
                    fill="rgba(5, 7, 12, 0.85)"
                    stroke={isSelected ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.08)'}
                    strokeWidth="1"
                    style={{ transition: 'all 0.2s' }}
                  />

                  {/* Left edge colored badge */}
                  <rect
                    x={pt.x - 85}
                    y={pt.y - 15}
                    width="4"
                    height="30"
                    rx="2"
                    fill={nodeColor}
                  />

                  {/* Node label text */}
                  <text
                    x={pt.x - 74}
                    y={pt.y + 4}
                    fill={isSelected ? '#ffffff' : 'var(--text-primary)'}
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="var(--font-sans)"
                  >
                    {node.name.length > 25 ? `${node.name.substring(0, 23)}...` : node.name}
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

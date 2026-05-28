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

interface GroupNode {
  groupName: string;
  nodes: TraceNode[];
  children: GroupNode[];
  // Calculated layout positions (relative to container)
  x: number;
  y: number;
  w: number;
  h: number;
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

  // Coordinate mapper with recursive group nesting support
  const layout = React.useMemo(() => {
    const coords: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const nodeCoords: Record<string, { x: number; y: number }> = {};
    const containerGroups: Record<string, GroupNode[]> = {};
    const groupParentMap: Record<string, string | null> = {}; // Tracks parent-group name of each group
    
    // Position containers horizontally
    containerIds.forEach((cId, index) => {
      const containerNodes = containersMap.get(cId) || [];
      // Sort nodes chronologically
      containerNodes.sort((a, b) => new Date(a.initiatedAtLocal).getTime() - new Date(b.initiatedAtLocal).getTime());

      const x = 50 + index * 300;
      const y = 60;
      const w = 260;

      // 1. Group nodes inside this container
      const groupNodesMap = new Map<string, TraceNode[]>();
      containerNodes.forEach(node => {
        const gName = node.group || `${node.name} group`;
        if (!groupNodesMap.has(gName)) groupNodesMap.set(gName, []);
        groupNodesMap.get(gName)!.push(node);
      });

      // 2. Identify parent-child relationships between groups in the container
      const localParentGroupMap = new Map<string, string | null>();
      groupNodesMap.forEach((gNodes, gName) => {
        let parentGroupName: string | null = null;
        for (const node of gNodes) {
          if (node.parentNodeId) {
            // Find parent node inside same container
            const parentNode = containerNodes.find(p => p.id === node.parentNodeId);
            if (parentNode) {
              const pGName = parentNode.group || `${parentNode.name} group`;
              if (pGName !== gName) {
                parentGroupName = pGName;
                break;
              }
            }
          }
        }
        localParentGroupMap.set(gName, parentGroupName);
        groupParentMap[`${cId}::${gName}`] = parentGroupName;
      });

      // 3. Create GroupNode objects
      const allGroupNodes = new Map<string, GroupNode>();
      groupNodesMap.forEach((gNodes, gName) => {
        allGroupNodes.set(gName, {
          groupName: gName,
          nodes: gNodes,
          children: [],
          x: 0, y: 0, w: 0, h: 0
        });
      });

      // 4. Connect children to parents to build Group forest
      const rootGroups: GroupNode[] = [];
      allGroupNodes.forEach((gNode, gName) => {
        const parentName = localParentGroupMap.get(gName);
        if (parentName && allGroupNodes.has(parentName)) {
          allGroupNodes.get(parentName)!.children.push(gNode);
        } else {
          rootGroups.push(gNode);
        }
      });

      // Sort subgroups chronologically
      const sortGroupsChronologically = (g: GroupNode) => {
        g.children.sort((a, b) => {
          const aTime = a.nodes[0] ? new Date(a.nodes[0].initiatedAtLocal).getTime() : 0;
          const bTime = b.nodes[0] ? new Date(b.nodes[0].initiatedAtLocal).getTime() : 0;
          return aTime - bTime;
        });
        g.children.forEach(sortGroupsChronologically);
      };

      rootGroups.sort((a, b) => {
        const aTime = a.nodes[0] ? new Date(a.nodes[0].initiatedAtLocal).getTime() : 0;
        const bTime = b.nodes[0] ? new Date(b.nodes[0].initiatedAtLocal).getTime() : 0;
        return aTime - bTime;
      });
      rootGroups.forEach(sortGroupsChronologically);

      // 5. Recursive layout positioning function
      const layoutGroup = (
        group: GroupNode, 
        startX: number, 
        startY: number, 
        width: number
      ): number => {
        group.x = startX;
        group.y = startY;
        group.w = width;

        let currentY = startY + 28; // Header padding

        // Position nodes inside this group card
        group.nodes.forEach((node) => {
          const nodeDepth = depthType === 'local' ? node.localDepthIndex : node.depthIndex;
          nodeCoords[node.id] = {
            // Center node horizontally in current card + depth slant offset
            x: startX + (width / 2) + (nodeDepth * 4),
            y: currentY + 18
          };
          currentY += 50; // Size of node (30px) + margin (20px)
        });

        if (group.nodes.length > 0 && group.children.length > 0) {
          currentY += 8; // Spacing before child groups
        }

        // Layout nested child groups inside this parent group card
        group.children.forEach(child => {
          const childWidth = width - 24; // Indent child block
          const childX = startX + 12;    // Center child inside parent
          const childHeight = layoutGroup(child, childX, currentY, childWidth);
          currentY += childHeight + 12;  // Spacing between sibling nested cards
        });

        group.h = currentY - startY + 6; // Bottom margin padding
        return group.h;
      };

      // 6. Execute layout starting from root groups inside the container
      let currentY = y + 45; // Start below the title bar
      rootGroups.forEach(rg => {
        const rgWidth = w - 24; // 236px
        const rgX = x + 12;
        const rgHeight = layoutGroup(rg, rgX, currentY, rgWidth);
        currentY += rgHeight + 14; // spacing between root groups
      });

      const containerHeight = Math.max(120, currentY - y);
      coords[cId] = { x, y, w, h: containerHeight };

      // 7. Flatten forest in pre-order traversal so parent elements are drawn before child elements
      const flatGroupLayouts: GroupNode[] = [];
      const flattenLayouts = (g: GroupNode) => {
        flatGroupLayouts.push(g);
        g.children.forEach(flattenLayouts);
      };
      rootGroups.forEach(flattenLayouts);
      containerGroups[cId] = flatGroupLayouts;
    });

    return { coords, nodeCoords, containerGroups, groupParentMap };
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
                    stroke="rgba(59, 130, 246, 0.2)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                </g>
              );
            })}

            {/* 3. Draw Containers & Dynamically Nested Group Cards */}
            {containerIds.map((cId) => {
              const c = layout.coords[cId];
              const groups = layout.containerGroups[cId] || [];
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

                  {/* Draw execution depth groups inside this Container (Nested cards) */}
                  {groups.map((group, gIdx) => {
                    // Compute depth level of the group card nesting inside the container
                    let groupDepth = 0;
                    let pName = layout.groupParentMap[`${cId}::${group.groupName}`];
                    while (pName) {
                      groupDepth++;
                      pName = layout.groupParentMap[`${cId}::${pName}`];
                    }

                    // Dynamically map colors to nesting levels (Blue -> Purple -> Teal -> Orange)
                    const borderColors = [
                      'rgba(59, 130, 246, 0.35)',  // Level 0: Blue
                      'rgba(139, 92, 246, 0.3)',   // Level 1: Purple
                      'rgba(20, 184, 166, 0.25)',  // Level 2: Teal
                      'rgba(249, 115, 22, 0.2)'    // Level 3: Orange
                    ];
                    const strokeColor = borderColors[groupDepth % borderColors.length];

                    const fillColors = [
                      'rgba(59, 130, 246, 0.025)', // Blue tint
                      'rgba(139, 92, 246, 0.02)',  // Purple tint
                      'rgba(20, 184, 166, 0.015)', // Teal tint
                      'rgba(249, 115, 22, 0.01)'   // Orange tint
                    ];
                    const fillColor = fillColors[groupDepth % fillColors.length];

                    const textColors = [
                      'var(--accent-blue)',
                      'var(--accent-purple)',
                      'var(--accent-teal)',
                      'var(--accent-orange)'
                    ];
                    const textColor = textColors[groupDepth % textColors.length];

                    return (
                      <g key={`${cId}-group-${gIdx}`}>
                        {/* Group bounding card with dashed border */}
                        <rect
                          x={group.x}
                          y={group.y}
                          width={group.w}
                          height={group.h}
                          rx="8"
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth="1.2"
                          strokeDasharray="4 4"
                          style={{ transition: 'all 0.3s' }}
                        />

                        {/* Header bar background for execution group */}
                        <rect
                          x={group.x + 1}
                          y={group.y + 1}
                          width={group.w - 2}
                          height="20"
                          rx="7"
                          fill="rgba(255, 255, 255, 0.02)"
                        />

                        {/* Group label */}
                        <text
                          x={group.x + 8}
                          y={group.y + 13}
                          fill={textColor}
                          fontSize="8"
                          fontWeight="700"
                          fontFamily="var(--font-display)"
                          letterSpacing="0.05em"
                        >
                          {group.groupName.toUpperCase()}
                        </text>

                        {/* Group node count indicator */}
                        <text
                          x={group.x + group.w - 8}
                          y={group.y + 13}
                          fill="var(--text-muted)"
                          fontSize="7.5"
                          fontWeight="600"
                          fontFamily="var(--font-sans)"
                          textAnchor="end"
                        >
                          {group.nodes.length} {group.nodes.length === 1 ? 'node' : 'nodes'}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* 4. Draw Individual Nodes inside Container Group Cards */}
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

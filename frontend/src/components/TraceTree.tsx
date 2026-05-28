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
  Container,
  AlertCircle,
  Sliders,
  Globe,
  Link
} from 'lucide-react';
import type { TraceNode } from '../services/api';
import { getContainerStyle, getNodeColor } from '../utils/styleUtils';

interface TraceTreeProps {
  nodes: TraceNode[];
  selectedNode: TraceNode | null;
  onSelectNode: (node: TraceNode) => void;
  collapsedNodeIds: Set<string>;
  toggleCollapseNode: (id: string) => void;
  search: string;
  depthType: 'global' | 'local';
  depth: number;
  setDepth: (d: number) => void;
  maxDepth: number;
  setDepthType: (type: 'global' | 'local') => void;
}

type RenderItem = 
  | { type: 'container_header'; containerId: string }
  | { type: 'group_header'; key: string; groupName: string; parentNodeId: string; depth: number; collapsed: boolean; childCount: number; containerId: string }
  | { type: 'node'; node: TraceNode; depth: number };

export const TraceTree: React.FC<TraceTreeProps> = ({
  nodes,
  selectedNode,
  onSelectNode,
  collapsedNodeIds,
  toggleCollapseNode,
  search,
  depthType,
  depth,
  setDepth,
  maxDepth,
  setDepthType
}) => {
  // Local state to track which logical depth groups are collapsed
  const [collapsedGroupKeys, setCollapsedGroupKeys] = React.useState<Set<string>>(new Set());

  const toggleCollapseGroup = React.useCallback((groupKey: string) => {
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // 1. Build parentage maps to efficiently identify hierarchy and folder states
  const parentToChildrenMap = React.useMemo(() => {
    const map = new Map<string, TraceNode[]>();
    nodes.forEach(node => {
      const pId = node.parentNodeId || '';
      if (!map.has(pId)) map.set(pId, []);
      map.get(pId)!.push(node);
    });
    return map;
  }, [nodes]);

  // Find direct child count for folders
  const getChildCount = (nodeId: string): number => {
    return parentToChildrenMap.get(nodeId)?.length || 0;
  };

  // 2. Perform DFS to build chronological render items grouped by container
  const { renderItems, traceStartTime, totalTraceDuration } = React.useMemo(() => {
    const visited = new Set<string>();

    // Calculate absolute start/end to normalize relative bars
    const times = nodes.map(n => new Date(n.initiatedAtLocal).getTime());
    const endTimes = nodes.map(n => n.completedAtLocal ? new Date(n.completedAtLocal).getTime() : new Date(n.processedAtLocal).getTime());
    
    const startTime = times.length > 0 ? Math.min(...times) : 0;
    const endTime = endTimes.length > 0 ? Math.max(...endTimes) : 0;
    const duration = endTime - startTime || 1;

    // First, group nodes by container
    const containerNodesMap = new Map<string, TraceNode[]>();
    nodes.forEach(node => {
      if (!containerNodesMap.has(node.containerId)) {
        containerNodesMap.set(node.containerId, []);
      }
      containerNodesMap.get(node.containerId)!.push(node);
    });

    const finalResult: RenderItem[] = [];

    // Process each container as a distinct section
    Array.from(containerNodesMap.keys()).sort().forEach(cId => {
      finalResult.push({ type: 'container_header', containerId: cId });
      
      const containerNodes = containerNodesMap.get(cId)!;
      const rootNodes = containerNodes.filter(n => !n.parentNodeId || !containerNodes.some(p => p.id === n.parentNodeId));
      rootNodes.sort((a, b) => new Date(a.initiatedAtLocal).getTime() - new Date(b.initiatedAtLocal).getTime());

      const containerResult: RenderItem[] = [];

      const dfs = (parentId: string) => {
        const children = parentToChildrenMap.get(parentId) || [];
        // Only include children that belong to this container for tree structure within container
        const localChildren = children.filter(c => c.containerId === cId);
        if (localChildren.length === 0) return;

        localChildren.sort((a, b) => new Date(a.initiatedAtLocal).getTime() - new Date(b.initiatedAtLocal).getTime());

        const groups: { groupName: string; nodes: TraceNode[] }[] = [];
        const groupMap = new Map<string, TraceNode[]>();

        localChildren.forEach(node => {
          const gName = node.group || 'Default';
          if (!groupMap.has(gName)) {
            groupMap.set(gName, []);
            groups.push({ groupName: gName, nodes: groupMap.get(gName)! });
          }
          groupMap.get(gName)!.push(node);
        });

        groups.forEach(group => {
          const firstNode = group.nodes[0];
          const groupDepth = depthType === 'local' ? firstNode.localDepthIndex : firstNode.depthIndex;
          const groupKey = `${cId}::${parentId}::${group.groupName}`;
          const isCollapsed = collapsedGroupKeys.has(groupKey);

          containerResult.push({
            type: 'group_header',
            key: groupKey,
            groupName: group.groupName,
            parentNodeId: parentId,
            depth: groupDepth,
            collapsed: isCollapsed,
            childCount: group.nodes.length,
            containerId: cId
          });

          group.nodes.forEach(node => {
            if (!visited.has(node.id)) {
              visited.add(node.id);
              const nodeDepth = depthType === 'local' ? node.localDepthIndex : node.depthIndex;
              containerResult.push({
                type: 'node',
                node,
                depth: nodeDepth + 1
              });
              dfs(node.id);
            }
          });
        });
      };

      // Start DFS from "container roots"
      // But first we need to handle the case where roots themselves might be in groups
      const rootGroups: { groupName: string; nodes: TraceNode[] }[] = [];
      const rootGroupMap = new Map<string, TraceNode[]>();
      
      rootNodes.forEach(node => {
        const gName = node.group || 'Default';
        if (!rootGroupMap.has(gName)) {
          rootGroupMap.set(gName, []);
          rootGroups.push({ groupName: gName, nodes: rootGroupMap.get(gName)! });
        }
        rootGroupMap.get(gName)!.push(node);
      });

      rootGroups.forEach(group => {
        const firstNode = group.nodes[0];
        const groupDepth = depthType === 'local' ? firstNode.localDepthIndex : firstNode.depthIndex;
        const groupKey = `${cId}::root::${group.groupName}`;
        const isCollapsed = collapsedGroupKeys.has(groupKey);

        containerResult.push({
          type: 'group_header',
          key: groupKey,
          groupName: group.groupName,
          parentNodeId: '',
          depth: groupDepth,
          collapsed: isCollapsed,
          childCount: group.nodes.length,
          containerId: cId
        });

        group.nodes.forEach(node => {
          if (!visited.has(node.id)) {
            visited.add(node.id);
            const nodeDepth = depthType === 'local' ? node.localDepthIndex : node.depthIndex;
            containerResult.push({
              type: 'node',
              node,
              depth: nodeDepth + 1
            });
            dfs(node.id);
          }
        });
      });
      finalResult.push(...containerResult);
    });

    return { 
      renderItems: finalResult, 
      traceStartTime: startTime, 
      totalTraceDuration: duration 
    };
  }, [nodes, parentToChildrenMap, collapsedGroupKeys, depthType]);

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
    
    const color = getNodeColor(type, isError);
    
    switch (type) {
      case 'http_server':
        return <Server size={size} style={{ color }} />;
      case 'http_client':
        return <Network size={size} style={{ color }} />;
      case 'database':
        return <Database size={size} style={{ color }} />;
      case 'pubsub':
      case 'queue':
        return <Radio size={size} style={{ color }} />;
      case 'function':
        return <Code size={size} style={{ color }} />;
      default:
        return <Cpu size={size} style={{ color }} />;
    }
  };

  // Helper to check if a node matches search query
  const matchesSearch = React.useCallback((node: TraceNode) => {
    if (search.trim() === '') return true;
    const query = search.toLowerCase();
    return (
      node.name.toLowerCase().includes(query) ||
      node.containerId.toLowerCase().includes(query) ||
      node.nodeType.toLowerCase().includes(query) ||
      (node.metadata && JSON.stringify(node.metadata).toLowerCase().includes(query))
    );
  }, [search]);

  // Compute final visible list of render items based on collapse states and search queries
  const filteredRenderItems = React.useMemo(() => {
    const hiddenNodeIds = new Set<string>();
    
    // Breadth-First traversal from root to compute which node IDs are collapsed/hidden
    const queue = [''];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = parentToChildrenMap.get(parentId) || [];
      
      children.forEach(c => {
        const groupName = c.group || 'Default';
        const groupKey = `${c.containerId}::${parentId}::${groupName}`;
        // Fallback for root groups
        const rootGroupKey = `${c.containerId}::root::${groupName}`;
        
        const isParentHidden = hiddenNodeIds.has(parentId);
        const isParentCollapsed = parentId ? collapsedNodeIds.has(parentId) : false;
        const isGroupCollapsed = collapsedGroupKeys.has(groupKey) || collapsedGroupKeys.has(rootGroupKey);
        
        if (isParentHidden || isParentCollapsed || isGroupCollapsed) {
          hiddenNodeIds.add(c.id);
        }
        queue.push(c.id);
      });
    }

    // Determine which nodes match the search (ignoring collapse state)
    const matchesSearchNodeIds = new Set<string>();
    nodes.forEach(node => {
      if (matchesSearch(node)) {
        matchesSearchNodeIds.add(node.id);
      }
    });

    // Determine which nodes are actually visible (not hidden by collapse AND match search)
    const visibleNodeIds = new Set<string>();
    nodes.forEach(node => {
      if (!hiddenNodeIds.has(node.id) && matchesSearchNodeIds.has(node.id)) {
        visibleNodeIds.add(node.id);
      }
    });

    // Helper to check if a group has any matching children (directly or recursively)
    const hasMatchingDescendants = (parentId: string, groupName: string, containerId: string): boolean => {
      const children = parentToChildrenMap.get(parentId) || [];
      const groupChildren = children.filter(c => {
        const gName = c.group || 'Default';
        return gName === groupName && c.containerId === containerId;
      });

      const checkDescendants = (nodeId: string): boolean => {
        if (matchesSearchNodeIds.has(nodeId)) return true;
        const subChildren = parentToChildrenMap.get(nodeId) || [];
        return subChildren.some(sc => checkDescendants(sc.id));
      };

      return groupChildren.some(c => checkDescendants(c.id));
    };

    const filtered = renderItems.filter(item => {
      if (item.type === 'node') {
        return visibleNodeIds.has(item.node.id);
      } else if (item.type === 'group_header') {
        // If parent is hidden, group is hidden
        if (item.parentNodeId && hiddenNodeIds.has(item.parentNodeId)) return false;
        // Only show group header if it contains matches or search is empty
        return hasMatchingDescendants(item.parentNodeId, item.groupName, item.containerId);
      }
      return true; // Keep container headers for now
    });

    // Post-process to remove container headers that have no visible children
    const final: RenderItem[] = [];
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].type === 'container_header') {
        const nextItem = filtered[i + 1];
        if (nextItem && nextItem.type !== 'container_header') {
          final.push(filtered[i]);
        }
      } else {
        final.push(filtered[i]);
      }
    }
    return final;
  }, [renderItems, nodes, parentToChildrenMap, collapsedNodeIds, collapsedGroupKeys, matchesSearch]);

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          Indented Tree Explorer
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '99px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {filteredRenderItems.filter(i => i.type === 'node').length} spans
          </span>
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Depth Type Toggle */}
          <div className="segment-control" style={{ padding: '0.15rem' }}>
            <button
              className={`segment-btn ${depthType === 'global' ? 'active' : ''}`}
              onClick={() => setDepthType('global')}
              style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
              title="Global Depth Mode"
            >
              <Globe size={10} style={{ marginRight: '0.2rem' }} />
              Global
            </button>
            <button
              className={`segment-btn ${depthType === 'local' ? 'active' : ''}`}
              onClick={() => setDepthType('local')}
              style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
              title="Local Depth Mode"
            >
              <Link size={10} style={{ marginRight: '0.2rem' }} />
              Local
            </button>
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--glass-border)' }} />

          {/* Depth Zoom Slider (Compact) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Sliders size={12} />
              Zoom
            </label>
            <input
              type="range"
              min="0"
              max={maxDepth}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              style={{
                width: '80px',
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
        {filteredRenderItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
            <Cpu size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '0.875rem' }}>No trace spans visible at this depth resolution.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Try adjusting the zoom slider or filtering search term.</p>
          </div>
        ) : (
          filteredRenderItems.map(item => {
            if (item.type === 'container_header') {
              const containerStyle = getContainerStyle(item.containerId);
              return (
                <div 
                  key={item.containerId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 0',
                    marginTop: '1.5rem',
                    marginBottom: '0.5rem',
                    borderBottom: `2px solid ${containerStyle.base}33`,
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-dark)', // Ensure background covers content when sticky
                    zIndex: 10
                  }}
                >
                  <Container size={16} style={{ color: containerStyle.base }} />
                  <span style={{ 
                    fontSize: '0.9rem', 
                    fontWeight: 800, 
                    color: containerStyle.base, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.1em' 
                  }}>
                    {item.containerId}
                  </span>
                </div>
              );
            }

            if (item.type === 'group_header') {
              const containerStyle = getContainerStyle(item.containerId);
              
              return (
                <div
                  key={item.key}
                  className={`tree-node-row depth-${item.depth}`}
                  style={{
                    '--depth': item.depth,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem 0.75rem',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.15s ease',
                    zIndex: 5
                  } as React.CSSProperties}
                  onClick={() => toggleCollapseGroup(item.key)}
                >
                  {/* Connector vertical guidelines */}
                  {Array.from({ length: item.depth }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `calc(${idx} * 32px + 16px)`,
                        top: 0,
                        bottom: 0,
                        width: '1px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'none',
                        zIndex: 1
                      }}
                    />
                  ))}

                  <div 
                    style={{ 
                      marginLeft: `calc(${item.depth} * 32px)`,
                      display: 'flex',
                      alignItems: 'center',
                      flex: 1,
                      minWidth: 0,
                      background: 'rgba(255, 255, 255, 0.02)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    {/* Folder chevron toggle trigger */}
                    <div 
                      style={{ 
                        width: '16px', 
                        height: '16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginRight: '0.25rem',
                        color: containerStyle.base,
                        zIndex: 2
                      }}
                    >
                      {item.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </div>

                    {/* Logical Group Label Badge */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                      <span 
                        style={{
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.groupName}
                      </span>
                      <span 
                        style={{
                          fontSize: '0.6rem',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        ({item.childCount})
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            // Otherwise, render a standard Node item
            const { node } = item;
            const hasChildren = getChildCount(node.id) > 0;
            const isCollapsed = collapsedNodeIds.has(node.id);
            const nodeDepth = item.depth;
            
            // Time Duration & Wait Calculations
            const selfTime = new Date(node.processedAtLocal).getTime() - new Date(node.initiatedAtLocal).getTime();
            const waitTime = node.completedAtLocal 
              ? new Date(node.completedAtLocal).getTime() - new Date(node.processedAtLocal).getTime()
              : 0;
            const totalDuration = selfTime + waitTime;

            const isSelected = selectedNode?.id === node.id;
            const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || (node.metadata.status >= 400)));

            const nodeColor = getNodeColor(node.nodeType, isError);

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
                      background: 'rgba(255, 255, 255, 0.1)',
                      pointerEvents: 'none',
                      zIndex: 1
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
                      background: 'rgba(255, 255, 255, 0.1)',
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
                  {/* Collapsible toggle trigger */}
                  <div 
                    style={{ 
                      width: '20px', 
                      height: '20px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      marginRight: '0.25rem',
                      color: 'var(--text-muted)',
                      zIndex: 2
                    }}
                    onClick={(e) => {
                      if (hasChildren) {
                        e.stopPropagation();
                        toggleCollapseNode(node.id);
                      }
                    }}
                  >
                    {hasChildren ? (
                      isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />
                    ) : null}
                  </div>

                  {/* Styled Type Icon */}
                  <div style={{ marginRight: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getNodeIcon(node.nodeType, isError)}
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
                          maxWidth: '220px'
                        }}
                        title={node.name}
                      >
                        {node.name}
                      </span>
                    </div>
                    
                    {/* Subtle Subtitle Details */}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      <span style={{ textTransform: 'uppercase', fontSize: '0.6rem', fontWeight: 700, color: nodeColor }}>
                        {node.nodeType.replace('_', ' ')}
                      </span>
                      <span>•</span>
                      <span style={{ fontSize: '0.7rem' }}>{totalDuration}ms</span>
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
                  title={`Start: +${new Date(node.initiatedAtLocal).getTime() - traceStartTime}ms | Duration: ${totalDuration}ms`}
                >
                  {/* Global reference grid lines */}
                  <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />
                  <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />

                  {/* Relative duration bar */}
                  {(() => {
                    const relativeStart = ((new Date(node.initiatedAtLocal).getTime() - traceStartTime) / totalTraceDuration) * 100;
                    const relativeWidth = (totalDuration / totalTraceDuration) * 100;
                    const selfWidth = (selfTime / totalDuration) * 100;

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
                          boxShadow: `0 0 8px ${getLatencyColor(totalDuration)}44`
                        }}
                      >
                        <div style={{ height: '100%', width: `${selfWidth}%`, background: 'var(--accent-green)' }} />
                        <div style={{ height: '100%', width: `${100 - selfWidth}%`, background: 'var(--accent-teal)', opacity: 0.7 }} />
                      </div>
                    );
                  })()}

                  {/* Latency Label */}
                  <div style={{ position: 'absolute', right: '4px', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: getLatencyColor(totalDuration), textShadow: '0 0 4px rgba(0,0,0,0.5)' }}>
                    {totalDuration}ms
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

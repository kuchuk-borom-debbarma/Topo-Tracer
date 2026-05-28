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
  Folder,
  FolderOpen
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
}

type RenderItem = 
  | { type: 'group_header'; key: string; groupName: string; parentNodeId: string; depth: number; collapsed: boolean; childCount: number; containerId: string }
  | { type: 'node'; node: TraceNode; depth: number };

export const TraceTree: React.FC<TraceTreeProps> = ({
  nodes,
  selectedNode,
  onSelectNode,
  collapsedNodeIds,
  toggleCollapseNode,
  search,
  depthType
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

  // 2. Perform DFS to build chronological render items with group headers
  const renderItems = React.useMemo(() => {
    const result: RenderItem[] = [];
    const visited = new Set<string>();

    const dfs = (parentId: string) => {
      const children = parentToChildrenMap.get(parentId) || [];
      if (children.length === 0) return;

      // Sort children by initiation timestamp
      children.sort((a, b) => new Date(a.initiatedAtLocal).getTime() - new Date(b.initiatedAtLocal).getTime());

      // Group sibling children by their group name
      const groups: { groupName: string; nodes: TraceNode[] }[] = [];
      const groupMap = new Map<string, TraceNode[]>();

      children.forEach(node => {
        // Fallback group name if missing
        const gName = node.group || `${nodes.find(n => n.id === parentId)?.name || 'Root'} group`;
        if (!groupMap.has(gName)) {
          groupMap.set(gName, []);
          groups.push({ groupName: gName, nodes: groupMap.get(gName)! });
        }
        groupMap.get(gName)!.push(node);
      });

      // Now process each group
      groups.forEach(group => {
        const firstNode = group.nodes[0];
        const groupDepth = depthType === 'local' ? firstNode.localDepthIndex : firstNode.depthIndex;
        const groupKey = `${parentId}::${group.groupName}`;
        const isCollapsed = collapsedGroupKeys.has(groupKey);

        // Render the group header at groupDepth
        result.push({
          type: 'group_header',
          key: groupKey,
          groupName: group.groupName,
          parentNodeId: parentId,
          depth: groupDepth,
          collapsed: isCollapsed,
          childCount: group.nodes.length,
          containerId: firstNode.containerId
        });

        // Render the children in this group, nested (depth + 1)
        group.nodes.forEach(node => {
          if (!visited.has(node.id)) {
            visited.add(node.id);
            const nodeDepth = depthType === 'local' ? node.localDepthIndex : node.depthIndex;
            result.push({
              type: 'node',
              node,
              depth: nodeDepth + 1 // Nest node inside its group header
            });
            // Recursively run DFS for this child's descendants
            dfs(node.id);
          }
        });
      });
    };

    dfs(''); // start from root parent

    // Add orphans that were not reached by standard DFS (in case of broken ancestry)
    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        const nodeDepth = depthType === 'local' ? n.localDepthIndex : n.depthIndex;
        result.push({
          type: 'node',
          node: n,
          depth: nodeDepth
        });
      }
    });

    return result;
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
        const groupName = c.group || `${nodes.find(n => n.id === parentId)?.name || 'Root'} group`;
        const groupKey = `${parentId}::${groupName}`;
        
        const isParentHidden = hiddenNodeIds.has(parentId);
        const isParentCollapsed = parentId ? collapsedNodeIds.has(parentId) : false;
        const isGroupCollapsed = collapsedGroupKeys.has(groupKey);
        
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
    const hasMatchingDescendants = (parentId: string, groupName: string): boolean => {
      const children = parentToChildrenMap.get(parentId) || [];
      const groupChildren = children.filter(c => {
        const gName = c.group || `${nodes.find(n => n.id === parentId)?.name || 'Root'} group`;
        return gName === groupName;
      });

      const checkDescendants = (nodeId: string): boolean => {
        if (matchesSearchNodeIds.has(nodeId)) return true;
        const subChildren = parentToChildrenMap.get(nodeId) || [];
        return subChildren.some(sc => checkDescendants(sc.id));
      };

      return groupChildren.some(c => checkDescendants(c.id));
    };

    return renderItems.filter(item => {
      if (item.type === 'node') {
        return visibleNodeIds.has(item.node.id);
      } else {
        // If parent is hidden, group is hidden
        if (item.parentNodeId && hiddenNodeIds.has(item.parentNodeId)) return false;
        // Only show group header if it contains matches or search is empty
        return hasMatchingDescendants(item.parentNodeId, item.groupName);
      }
    });
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
                    background: `linear-gradient(90deg, ${containerStyle.bgTint} 0%, rgba(255,255,255,0.01) 100%)`,
                    border: `1px solid ${containerStyle.border}`,
                    borderLeft: `4px solid ${containerStyle.base}`,
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    marginBottom: '0.35rem',
                    marginTop: '0.25rem',
                    position: 'relative',
                    backdropFilter: 'blur(8px)',
                    boxShadow: `0 0 10px ${containerStyle.glowing}`,
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
                      {item.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {/* Group Icon */}
                    <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: containerStyle.base }}>
                      {item.collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
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
                        {item.groupName}
                      </span>
                      <span 
                        style={{
                          fontSize: '0.65rem',
                          color: containerStyle.base,
                          background: containerStyle.bgTint,
                          border: `1px solid ${containerStyle.border}`,
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.childCount} {item.childCount === 1 ? 'span' : 'spans'}
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
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  marginBottom: '0.25rem',
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

                      {/* Container Scope Badge */}
                      {(() => {
                        const containerStyle = getContainerStyle(node.containerId);
                        return (
                          <span 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.2rem',
                              fontSize: '0.7rem', 
                              background: containerStyle.bgTint, 
                              border: `1px solid ${containerStyle.border}`,
                              padding: '0.1rem 0.4rem', 
                              borderRadius: '4px',
                              color: containerStyle.base,
                              filter: `drop-shadow(0 0 2px ${containerStyle.glowing})`,
                              fontWeight: 600
                            }}
                          >
                            <Container size={10} style={{ color: containerStyle.base }} />
                            {node.containerId}
                          </span>
                        );
                      })()}
                    </div>
                    
                    {/* Subtle Subtitle Details */}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      <span style={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700, color: nodeColor }}>
                        {node.nodeType.replace('_', ' ')}
                      </span>
                      <span>•</span>
                      <span>{totalDuration}ms duration {waitTime > 0 ? `(${selfTime}ms self + ${waitTime}ms wait)` : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Inline Performance Latency Visualizer bar */}
                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-end', 
                    gap: '0.25rem', 
                    width: '130px' 
                  }}
                  title={`Self Time: ${selfTime}ms | Wait Time: ${waitTime}ms`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: getLatencyColor(totalDuration) }}>
                      {totalDuration}ms
                    </span>
                    {waitTime > 0 && (
                      <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        ({selfTime}+{waitTime})
                      </span>
                    )}
                  </div>
                  <div 
                    style={{ 
                      width: '100%', 
                      height: '5px', 
                      background: 'rgba(255, 255, 255, 0.06)', 
                      borderRadius: '3px', 
                      overflow: 'hidden', 
                      display: 'flex',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${Math.min(100, (totalDuration / 800) * 100)}%`, 
                        display: 'flex',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}
                    >
                      {selfTime > 0 && (
                        <div 
                          style={{ 
                            height: '100%', 
                            width: `${(selfTime / totalDuration) * 100}%`, 
                            background: 'var(--accent-green)'
                          }} 
                        />
                      )}
                      {waitTime > 0 && (
                        <div 
                          style={{ 
                            height: '100%', 
                            width: `${(waitTime / totalDuration) * 100}%`, 
                            background: 'var(--accent-teal)'
                          }} 
                        />
                      )}
                    </div>
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

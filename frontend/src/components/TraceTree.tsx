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
  AlertCircle
} from 'lucide-react';
import type { TraceNode } from '../services/api';


interface TraceTreeProps {
  nodes: TraceNode[];
  selectedNode: TraceNode | null;
  onSelectNode: (node: TraceNode) => void;
  collapsedNodeIds: Set<string>;
  toggleCollapseNode: (id: string) => void;
  search: string;
  depthType: 'global' | 'local';
}

export const TraceTree: React.FC<TraceTreeProps> = ({
  nodes,
  selectedNode,
  onSelectNode,
  collapsedNodeIds,
  toggleCollapseNode,
  search,
  depthType
}) => {
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

  // Determine if a node is currently hidden due to any parent in its ancestry being collapsed
  const isNodeHiddenByCollapse = React.useMemo(() => {
    const hiddenSet = new Set<string>();
    
    // Breadth-First traversal starting from collapsed nodes
    const queue = Array.from(collapsedNodeIds);
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = parentToChildrenMap.get(parentId) || [];
      children.forEach(c => {
        if (!hiddenSet.has(c.id)) {
          hiddenSet.add(c.id);
          queue.push(c.id);
        }
      });
    }
    
    return hiddenSet;
  }, [collapsedNodeIds, parentToChildrenMap]);

  // 2. Perform depth-first sort on nodes so we display the tree in chronological order
  const orderedNodes = React.useMemo(() => {
    const result: TraceNode[] = [];
    const visited = new Set<string>();

    const dfs = (parentNodeId: string) => {
      const children = parentToChildrenMap.get(parentNodeId) || [];
      // Sort children by initiation timestamp
      children.sort((a, b) => new Date(a.initiatedAtLocal).getTime() - new Date(b.initiatedAtLocal).getTime());
      
      children.forEach(node => {
        if (!visited.has(node.id)) {
          visited.add(node.id);
          result.push(node);
          dfs(node.id);
        }
      });
    };

    dfs(''); // start from root parent
    
    // Add any orphans that were not reached by standard DFS (in case of broken ancestry)
    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        result.push(n);
      }
    });

    return result;
  }, [nodes, parentToChildrenMap]);

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
        return <Server size={size} style={{ color: 'var(--accent-green)' }} />;
      case 'http_client':
        return <Network size={size} style={{ color: 'var(--accent-blue)' }} />;
      case 'database':
        return <Database size={size} style={{ color: 'var(--accent-teal)' }} />;
      case 'pubsub':
      case 'queue':
        return <Radio size={size} style={{ color: 'var(--accent-orange)' }} />;
      case 'function':
        return <Code size={size} style={{ color: 'var(--accent-purple)' }} />;
      default:
        return <Cpu size={size} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  // Search filter
  const filteredNodes = orderedNodes.filter(n => {
    if (isNodeHiddenByCollapse.has(n.id)) return false;
    
    if (search.trim() === '') return true;
    
    const query = search.toLowerCase();
    return (
      n.name.toLowerCase().includes(query) ||
      n.containerId.toLowerCase().includes(query) ||
      n.nodeType.toLowerCase().includes(query) ||
      (n.metadata && JSON.stringify(n.metadata).toLowerCase().includes(query))
    );
  });

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          Indented Tree Explorer
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '99px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {filteredNodes.length} visible
          </span>
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '600px', paddingRight: '0.5rem' }} className="tree-container">
        {filteredNodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
            <Cpu size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '0.875rem' }}>No trace spans visible at this depth resolution.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Try adjusting the zoom slider or filtering search term.</p>
          </div>
        ) : (
          filteredNodes.map(node => {
            const hasChildren = getChildCount(node.id) > 0;
            const isCollapsed = collapsedNodeIds.has(node.id);
            const nodeDepth = depthType === 'local' ? node.localDepthIndex : node.depthIndex;
            
            // Duration calculation
            const duration = node.completedAtLocal 
              ? new Date(node.completedAtLocal).getTime() - new Date(node.initiatedAtLocal).getTime()
              : 0;

            const isSelected = selectedNode?.id === node.id;
            const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || (node.metadata.status >= 400)));

            return (
              <div
                key={node.id}
                className={`tree-node-row depth-${nodeDepth}`}
                style={{
                  '--depth': nodeDepth,
                  display: 'flex',
                  alignItems: 'center',
                  background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  marginBottom: '0.25rem',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                } as React.CSSProperties}
                onClick={() => onSelectNode(node)}
              >
                {/* Connector vertical guidelines */}
                {Array.from({ length: nodeDepth }).map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `calc(${idx} * 24px + 12px)`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      pointerEvents: 'none'
                    }}
                  />
                ))}

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
                      <Container size={10} />
                      {node.containerId}
                    </span>
                  </div>
                  
                  {/* Subtle Subtitle Details */}
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    <span style={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {node.nodeType.replace('_', ' ')}
                    </span>
                    <span>•</span>
                    <span>{duration}ms duration</span>
                  </div>
                </div>

                {/* Inline Performance Latency Visualizer bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '90px' }}>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: getLatencyColor(duration), width: '45px', textAlign: 'right' }}>
                    {duration}ms
                  </span>
                  <div style={{ flex: 1, height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${Math.min(100, (duration / 800) * 100)}%`, 
                        background: getLatencyColor(duration),
                        borderRadius: '2px'
                      }} 
                    />
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

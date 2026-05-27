import { createRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Route as rootRoute } from './__root';
import { telemetryApi } from '../api/telemetry';
import { Loader2, AlertCircle } from 'lucide-react';
import { ReactFlow, Controls, Background, BackgroundVariant, useNodesState, useEdgesState, Panel } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ContainerNode, ExecutionNode } from '../components/FlowNodes';
import { getLayoutedElements } from '../utils/layoutUtils';

const nodeTypes = {
  containerNode: ContainerNode,
  executionNode: ExecutionNode,
};

function TraceViewer() {
  const { traceId } = Route.useParams();
  const [depthFilter, setDepthFilter] = useState<number>(0); 
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['trace', traceId, depthFilter],
    queryFn: () => telemetryApi.getTrace(traceId, depthFilter),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (data && data.nodes.length > 0) {
      // Reconstruct containers safely from nodes and wires
      const containerIds = new Set(data.nodes.map(n => n.containerId));
      if (data.visualWires) {
        data.visualWires.forEach(w => {
          if (w.fromTarget.type === 'container') containerIds.add(w.fromTarget.id);
          if (w.toTarget.type === 'container') containerIds.add(w.toTarget.id);
        });
      }
      const containers = Array.from(containerIds).map(id => ({ id, name: id, containerType: 'unknown' as any, createdAtLocal: new Date(), createdAtRemote: new Date() }));
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        data.nodes,
        data.edges,
        containers,
        data.visualWires,
        'LR' // Left to Right DAG for better distributed system visualization
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [data, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <Loader2 className="animate-spin" size={32} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent-red)' }}>
        <AlertCircle size={48} style={{ marginBottom: '1rem' }} />
        <h2>Failed to load trace {traceId}</h2>
        <p>{error?.message}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header controls */}
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Trace: <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{traceId}</span></h2>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="glass-panel" style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: 0 }}>
        {data.nodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <AlertCircle size={48} style={{ marginBottom: '1rem', color: 'var(--accent-yellow)' }} />
            <h2>Trace Not Found</h2>
            <p>No telemetry data found for trace ID "{traceId}".</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            className="dark-theme-flow"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255, 255, 255, 0.05)" />
            <Controls style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--border-radius-sm)' }} showInteractive={false} />
            <Panel position="top-right" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-surface-elevated)', padding: '0.5rem 1rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--glass-border)' }}>
              {!data.isZoomReady ? (
                <span style={{ fontSize: '0.9rem', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Loader2 className="animate-spin" size={14} /> Materializing Zoom...
                </span>
              ) : (
                <>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Zoom Depth:
                  </span>
                  <input 
                    type="range" 
                    min={0} 
                    max={data.maxAvailableDepth} 
                    step={1}
                    value={depthFilter} 
                    onChange={(e) => setDepthFilter(parseInt(e.target.value, 10))} 
                    style={{ width: '100px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, width: '20px', textAlign: 'center' }}>
                    {depthFilter}
                  </span>
                </>
              )}
            </Panel>
          </ReactFlow>
        )}
      </div>
      <style>{`
        .dark-theme-flow .react-flow__edge-path {
          stroke: rgba(255, 255, 255, 0.2) !important;
        }
        .dark-theme-flow .react-flow__edge.animated .react-flow__edge-path {
          stroke: var(--accent-cyan) !important;
          animation: dashdraw 30s linear infinite;
        }
        @keyframes dashdraw {
          from { stroke-dashoffset: 1000; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trace/$traceId',
  component: TraceViewer,
});

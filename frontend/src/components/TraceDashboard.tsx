import React, { useState, useEffect } from 'react';
import { TraceMetrics } from './TraceMetrics';
import { TraceTree } from './TraceTree';
import { TraceGraph } from './TraceGraph';
import { TraceList } from './TraceList';
import { NodeInspector } from './NodeInspector';
import { fetchTraceLayout } from '../services/api';
import type { ReadBlock, ReadNode, ReadEdge } from '../services/api';

import { AlertCircle, List, Network, History, UploadCloud, Download, RefreshCw } from 'lucide-react';


export const TraceDashboard: React.FC = () => {
  // State definitions
  const [activeTab, setActiveTab] = useState<'tree' | 'topology' | 'list'>('tree');
  const [traceId, setTraceId] = useState<string>('mock');

  const [depth, setDepth] = useState<number>(3);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  
  const [nodes, setNodes] = useState<ReadNode[]>([]);
  const [blocks, setBlocks] = useState<ReadBlock[]>([]);
  const [edges, setEdges] = useState<ReadEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<ReadNode | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [isOpenInspector, setIsOpenInspector] = useState<boolean>(false);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Synchronize telemetry payload based on active zoom depth or type
  const loadTraceTelemetry = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    try {
      // Fetch trace details
      const traceLayout = await fetchTraceLayout(traceId, depth);
      setNodes(traceLayout.nodes || []);
      setBlocks(traceLayout.blocks || []);
      setEdges(traceLayout.edges || []);

      // Fetch metadata to find slider max values
      const meta = traceLayout.metadata;
      const activeMax = meta.maxAvailableDepth;
      setMaxDepth(activeMax || 0);

      // Clamp visual depth if it exceeds new limits
      if (depth > (activeMax || 0)) {
        setDepth(activeMax || 0);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to query trace "${traceId}". Check if ClickHouse & Carno.js are running on localhost:3000.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Run initial fetch on mount
  useEffect(() => {
    loadTraceTelemetry();
  }, [traceId, depth]);

  // Handle manual explicit click query
  const handleFetch = () => {
    // Reset visual depth to standard starting point
    setDepth(3);
    loadTraceTelemetry();
  };

  // Node branch collapse operators
  const toggleCollapseNode = (id: string) => {
    setCollapsedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Node selection triggers details drawer
  const handleSelectNode = (node: ReadNode) => {
    setSelectedNode(node);
    setIsOpenInspector(true);
  };

  const handleDownloadTrace = () => {
    if (nodes.length === 0) return;
    const data = {
      nodes,
      blocks,
      edges,
      metadata: {
        traceId,
        isZoomReady: true,
        maxAvailableDepth: maxDepth,
        currentDepth: depth
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trace-${traceId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processFile = (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        setNodes(data.nodes || []);
        setBlocks(data.blocks || []);
        setEdges(data.edges || []);
        
        const activeMax = data.metadata?.maxAvailableDepth ?? 3;
        setMaxDepth(activeMax);
        setTraceId(`file: ${file.name.substring(0, 15)}...`);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(`Failed to parse file "${file.name}". Ensure it is a valid Topo-Tracer depth export JSON.`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1rem 2rem 3rem' }}>
      
      {/* Minimal Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h1 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 800, 
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
            margin: 0
          }}>
            Topo-Tracer
          </h1>

          <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(5, 7, 12, 0.4)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}>
            <input
              type="text"
              placeholder="Trace ID..."
              value={traceId}
              onChange={(e) => setTraceId(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.3rem 0.6rem',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                width: '240px'
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFetch(); }}
            />
            <button
              onClick={handleFetch}
              disabled={isLoading}
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: 'none', 
                color: 'var(--text-primary)', 
                padding: '0 0.75rem', 
                borderRadius: '4px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem'
              }}
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? '' : 'Fetch'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {nodes.length > 0 && (
              <button 
                onClick={handleDownloadTrace}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
              >
                <Download size={14} />
                Export
              </button>
            )}
            <button 
              onClick={() => document.getElementById('global-upload')?.click()}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
            >
              <UploadCloud size={14} />
              Upload
            </button>
            <input 
              id="global-upload"
              type="file" 
              accept=".json" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFile(e.target.files[0]);
                }
              }}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </header>

      {/* Warnings & errors segment banner */}
      {errorMsg && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          background: 'rgba(239, 68, 68, 0.08)', 
          border: '1px solid rgba(239, 68, 68, 0.25)', 
          padding: '1rem 1.25rem', 
          borderRadius: 'var(--radius-md)', 
          color: 'var(--text-primary)', 
          fontSize: '0.875rem',
          marginBottom: '1.5rem'
        }}>
          <AlertCircle size={18} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span>{errorMsg}</span>
            <button 
              onClick={() => setTraceId('mock')} 
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--text-primary)', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
            >
              Load Mock Demo Trace
            </button>
          </div>
        </div>
      )}

      {/* Full width workspace */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Active stats metrics widgets */}
        <TraceMetrics nodes={nodes} blocks={blocks} edges={edges} />

        {/* Tabs Selector Navigation */}
        <div className="dashboard-tabs">
          <button 
            className={`tab-trigger ${activeTab === 'tree' ? 'active' : ''}`}
            onClick={() => setActiveTab('tree')}
          >
            <List size={16} />
            Trace Tree
          </button>
          <button 
            className={`tab-trigger ${activeTab === 'topology' ? 'active' : ''}`}
            onClick={() => setActiveTab('topology')}
          >
            <Network size={16} />
            Topology
          </button>
          <button 
            className={`tab-trigger ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            <History size={16} />
            History
          </button>
        </div>

        {/* Active Workspace Viewport */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '600px' }}>
          {activeTab === 'tree' ? (
            <TraceTree
              nodes={nodes}
              blocks={blocks}
              selectedNode={selectedNode}
              onSelectNode={handleSelectNode}
              collapsedNodeIds={collapsedNodeIds}
              toggleCollapseNode={toggleCollapseNode}
              depth={depth}
              setDepth={setDepth}
              maxDepth={maxDepth}
            />
          ) : activeTab === 'topology' ? (
            <TraceGraph
              nodes={nodes}
              blocks={blocks}
              edges={edges}
              selectedNode={selectedNode}
              onSelectNode={handleSelectNode}
              depth={depth}
              setDepth={setDepth}
              maxDepth={maxDepth}
            />
          ) : (
            <TraceList 
              onSelectTrace={(id) => {
                setTraceId(id);
                setActiveTab('tree');
                setDepth(3);
              }}
            />
          )}
        </div>

      </div>

      {/* Floating sliding Inspector panel drawer */}
      <NodeInspector
        node={selectedNode}
        nodes={nodes}
        edges={edges}
        isOpen={isOpenInspector}
        onClose={() => setIsOpenInspector(false)}
      />

    </div>
  );
};
export default TraceDashboard;

import React, { useState, useEffect } from 'react';
import { TraceControls } from './TraceControls';
import { TraceMetrics } from './TraceMetrics';
import { TraceTree } from './TraceTree';
import { TraceGraph } from './TraceGraph';
import { NodeInspector } from './NodeInspector';
import { fetchTraceFull, fetchTraceMetadata } from '../services/api';
import type { TraceNode, VisualWire } from '../services/api';

import { AlertCircle, UploadCloud, Terminal, List, Network } from 'lucide-react';


export const TraceDashboard: React.FC = () => {
  // State definitions
  const [activeTab, setActiveTab] = useState<'tree' | 'topology'>('tree');
  const [traceId, setTraceId] = useState<string>('mock');

  const [depth, setDepth] = useState<number>(3);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [depthType, setDepthType] = useState<'global' | 'local'>('global');
  const [search, setSearch] = useState<string>('');
  
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [wires, setWires] = useState<VisualWire[]>([]);
  const [selectedNode, setSelectedNode] = useState<TraceNode | null>(null);
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
      const traceData = await fetchTraceFull(traceId, depth, depthType);
      setNodes(traceData.nodes || []);
      setWires(traceData.visualWires || []);

      // Fetch metadata to find slider max values
      const meta = await fetchTraceMetadata(traceId);
      const activeMax = depthType === 'local' ? meta.maxAvailableLocalDepth : meta.maxAvailableDepth;
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
  }, [depth, depthType]);

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

  const handleExpandAll = () => {
    setCollapsedNodeIds(new Set());
  };

  const handleCollapseAll = () => {
    const parentNodeIds = new Set<string>();
    nodes.forEach(n => {
      if (n.parentNodeId) parentNodeIds.add(n.parentNodeId);
    });
    setCollapsedNodeIds(parentNodeIds);
  };

  // Node selection triggers details drawer
  const handleSelectNode = (node: TraceNode) => {
    setSelectedNode(node);
    setIsOpenInspector(true);
  };

  // Offline drag & drop JSON parser fallback
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        setNodes(data.nodes || []);
        setWires(data.visualWires || []);
        
        const activeMax = depthType === 'local' ? data.maxAvailableLocalDepth : data.maxAvailableDepth;
        setMaxDepth(activeMax ?? 3);
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
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 2rem 3rem' }}>
      
      {/* Dynamic Glow Spotlight Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ 
            fontSize: '2.25rem', 
            fontWeight: 800, 
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em',
            margin: 0
          }}>
            Topo-Tracer Observability Console
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
            Interactive Multi-Resolution Trace Zoom & Infrastructure Topography
          </p>
        </div>

        {/* Status indicator tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
          <Terminal size={14} style={{ color: 'var(--accent-teal)' }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Service Layer Active:
          </span>
          <span style={{ 
            fontSize: '0.8125rem', 
            fontWeight: 700, 
            color: traceId.startsWith('file:') ? 'var(--accent-purple)' : 'var(--accent-green)' 
          }}>
            {traceId.startsWith('file:') ? 'OFFLINE PLAYBACK' : 'LIVE TELEMETRY'}
          </span>
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

      {/* Core split layout workspace */}
      <div className="dashboard-grid">
        
        {/* LEFT SIDEBAR - CONTROLS & INGESTION DROPZONE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Slider and query deck */}
          <TraceControls
            traceId={traceId}
            setTraceId={setTraceId}
            depth={depth}
            setDepth={setDepth}
            maxDepth={maxDepth}
            depthType={depthType}
            setDepthType={setDepthType}
            search={search}
            setSearch={setSearch}
            onFetch={handleFetch}
            isLoading={isLoading}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
          />

          {/* Offline drop analyzer fallback */}
          <div 
            onDragOver={handleDragOver}
            onDrop={handleFileDrop}
            className="glass-panel"
            style={{ 
              padding: '1.5rem', 
              textAlign: 'center', 
              border: '1.5px dashed var(--glass-border)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.25s'
            }}
            onClick={() => document.getElementById('offline-select')?.click()}
          >
            <UploadCloud size={24} style={{ color: 'var(--accent-blue)', opacity: 0.8 }} />
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Offline File Playback
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Drag simulated depth JSON here or click to browse.
            </p>
            <input 
              id="offline-select"
              type="file" 
              accept=".json" 
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

        </div>

        {/* RIGHT MAIN PANEL - METRICS, TABS & ACTIVE VIEWPORT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          
          {/* Active stats metrics widgets */}
          <TraceMetrics nodes={nodes} wires={wires} />

          {/* Tabs Selector Navigation */}
          <div className="dashboard-tabs">
            <button 
              className={`tab-trigger ${activeTab === 'tree' ? 'active' : ''}`}
              onClick={() => setActiveTab('tree')}
            >
              <List size={16} />
              Hierarchical Trace Tree Explorer
            </button>
            <button 
              className={`tab-trigger ${activeTab === 'topology' ? 'active' : ''}`}
              onClick={() => setActiveTab('topology')}
            >
              <Network size={16} />
              Architecture Topology Canvas
            </button>
          </div>

          {/* Active Workspace Viewport */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
            {activeTab === 'tree' ? (
              <TraceTree
                nodes={nodes}
                selectedNode={selectedNode}
                onSelectNode={handleSelectNode}
                collapsedNodeIds={collapsedNodeIds}
                toggleCollapseNode={toggleCollapseNode}
                search={search}
                depthType={depthType}
              />
            ) : (
              <TraceGraph
                nodes={nodes}
                wires={wires}
                selectedNode={selectedNode}
                onSelectNode={handleSelectNode}
                depthType={depthType}
              />

            )}
          </div>

        </div>

      </div>

      {/* Floating sliding Inspector panel drawer */}
      <NodeInspector
        node={selectedNode}
        isOpen={isOpenInspector}
        onClose={() => setIsOpenInspector(false)}
      />


    </div>
  );
};
export default TraceDashboard;

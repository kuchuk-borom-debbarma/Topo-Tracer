import React from 'react';
import { X, Clock, Tag, Share2, AlertCircle, CheckCircle, Boxes, GitCommit } from 'lucide-react';
import type { ReadNode, ReadEdge } from '../services/api';
import { getNodeColor } from '../utils/styleUtils';

interface NodeInspectorProps {
  node: ReadNode | null;
  nodes: ReadNode[];
  edges: ReadEdge[];
  onClose: () => void;
  isOpen: boolean;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({ node, nodes, edges = [], onClose, isOpen }) => {
  if (!node) return null;

  const totalDuration = node.durationUs ? node.durationUs / 1000 : 0;
  const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || (node.metadata.status && (typeof node.metadata.status === 'number' ? node.metadata.status >= 400 : true))));
  const nodeColor = getNodeColor(node.type, isError);

  // Resolve incoming and outgoing snapped edge connections
  const incomingEdges = edges.filter(e => e.toNodeId === node.id);
  const outgoingEdges = edges.filter(e => e.fromNodeId === node.id);

  return (
    <div className={`slide-drawer ${isOpen ? 'open' : ''}`}>
      
      {/* Header with Close trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isError ? (
            <AlertCircle size={18} style={{ color: 'var(--accent-red)' }} />
          ) : (
            <CheckCircle size={18} style={{ color: 'var(--accent-green)' }} />
          )}
          Span Inspector
        </h3>
        <button 
          onClick={onClose} 
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Main Component Title Block */}
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: nodeColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {node.type.replace('_', ' ')}
          </span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem', wordBreak: 'break-all' }}>
            {node.name}
          </h2>
        </div>

        {/* Latency Bar Overview */}
        <div className="glass-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Clock size={20} style={{ color: 'var(--accent-teal)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <span>Span Execution Duration</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{totalDuration > 0 ? `${totalDuration.toFixed(2)}ms` : 'instant'}</span>
            </div>
            {totalDuration > 0 && (
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.4rem' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${Math.min(100, (totalDuration / 500) * 100)}%`, 
                    background: nodeColor
                  }} 
                />
              </div>
            )}
          </div>
        </div>

        {/* Deep observed latency profiler */}
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={14} style={{ color: 'var(--accent-teal)' }} />
            Timing & Zoom Resolution Metrics
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(5,7,12,0.4)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Start Epoch Timestamp:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{node.startTimeUs} μs</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Raw Zoom Visibility Level:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-blue)' }}>Level {node.zoomLevel}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Chronological Sequence ID:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{node.localSequence}</span>
            </div>
          </div>
        </div>

        {/* Structural Blueprint & Ancestry Path */}
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Share2 size={14} style={{ color: 'var(--accent-purple)' }} />
            Absolute Ancestry Path Mapping
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(5,7,12,0.4)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Containing Block ID:</span>
              <span style={{ color: 'var(--accent-purple)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{node.blockId}</span>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', margin: '0.25rem 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Indented Parentage Chain:</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                {node.ancestryPath && node.ancestryPath.map((ancestor, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', paddingLeft: `${idx * 10}px`, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <GitCommit size={10} style={{ color: idx === node.ancestryPath.length - 1 ? nodeColor : 'var(--text-muted)' }} />
                    <span style={{ color: idx === node.ancestryPath.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {ancestor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Snapped Connections Blueprint */}
        {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
          <div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Boxes size={14} style={{ color: 'var(--accent-pink)' }} />
              Active Topographical Connections
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(5,7,12,0.4)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--glass-border)' }}>
              {incomingEdges.map((e, idx) => (
                <div key={`in-${idx}`} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: 'var(--accent-pink)', fontWeight: 600 }}>[IN]</span>
                  <span>From Block {e.fromBlockId}</span>
                </div>
              ))}
              {outgoingEdges.map((e, idx) => (
                <div key={`out-${idx}`} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>[OUT]</span>
                  <span>To Block {e.toBlockId}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Tags / Metadata */}
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Tag size={14} style={{ color: 'var(--accent-blue)' }} />
            Telemetry Metadata Tags
          </h4>
          {node.metadata ? (
            <pre style={{
              background: '#04060b',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              color: '#a5b4fc',
              lineHeight: '1.4'
            }}>
              {JSON.stringify(node.metadata, null, 2)}
            </pre>
          ) : (
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No custom attributes tagged on this span.
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
export default NodeInspector;

import React from 'react';
import { X, Clock, Tag, Share2, Layers, AlertCircle, CheckCircle } from 'lucide-react';
import type { TraceNode } from '../services/api';


interface NodeInspectorProps {
  node: TraceNode | null;
  onClose: () => void;
  isOpen: boolean;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({ node, onClose, isOpen }) => {
  if (!node) return null;

  const duration = node.completedAtLocal
    ? new Date(node.completedAtLocal).getTime() - new Date(node.initiatedAtLocal).getTime()
    : 0;

  const isError = !!(node.metadata && (node.metadata.error || node.metadata.exception || node.metadata.status >= 400));

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
          className="hover:bg-white/5"
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Main Component Title Block */}
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isError ? 'var(--accent-red)' : 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {node.nodeType.replace('_', ' ')}
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
              <span>Execution Time</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{duration}ms</span>
            </div>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.4rem' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${Math.min(100, (duration / 800) * 100)}%`, 
                  background: isError ? 'var(--accent-red)' : 'var(--accent-teal)'
                }} 
              />
            </div>
          </div>
        </div>

        {/* Chronological Timestamps */}
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={14} />
            Chronological Milestones
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(5,7,12,0.4)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Initiated:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {new Date(node.initiatedAtLocal).toLocaleTimeString()}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: '0.3rem' }}>
                  .{new Date(node.initiatedAtLocal).getMilliseconds()}ms
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Processed:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {new Date(node.processedAtLocal).toLocaleTimeString()}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: '0.3rem' }}>
                  .{new Date(node.processedAtLocal).getMilliseconds()}ms
                </span>
              </span>
            </div>
            {node.completedAtLocal && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Completed:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {new Date(node.completedAtLocal).toLocaleTimeString()}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: '0.3rem' }}>
                    .{new Date(node.completedAtLocal).getMilliseconds()}ms
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Structural Context */}
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Share2 size={14} />
            Structural Blueprint
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(5,7,12,0.4)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Container Name:</span>
              <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{node.containerId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Parent Node ID:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                {node.parentNodeId ? `${node.parentNodeId.split('-')[0]}...` : 'None (Root Node)'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Global Index Depth:</span>
              <span style={{ fontWeight: 600 }}>{node.depthIndex}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Local Container Depth:</span>
              <span style={{ fontWeight: 600 }}>{node.localDepthIndex}</span>
            </div>
            {node.group && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Logical Depth Group:</span>
                <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{node.group}</span>
              </div>
            )}
          </div>
        </div>

        {/* Custom Tags / Metadata */}
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Tag size={14} />
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

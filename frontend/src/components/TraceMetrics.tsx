import React from 'react';
import { Eye, Network, Clock, AlertTriangle, Disc } from 'lucide-react';
import type { TraceNode, VisualWire } from '../services/api';

interface TraceMetricsProps {
  nodes: TraceNode[];
  wires: VisualWire[];
}

export const TraceMetrics: React.FC<TraceMetricsProps> = ({ nodes, wires }) => {

  // Compute some aggregated statistics
  const errors = nodes.filter(n => {
    if (!n.metadata) return false;
    const status = n.metadata.status || n.metadata.statusCode;
    if (status && (typeof status === 'number' ? status >= 400 : status.toString().startsWith('5') || status.toString().startsWith('4'))) return true;
    if (n.metadata.error || n.metadata.exception) return true;
    return false;
  }).length;

  const totalDuration = React.useMemo(() => {
    if (!nodes.length) return 0;
    
    // Find entrypoint node (parentNodeId is empty)
    const root = nodes.find(n => n.parentNodeId === '') || nodes[0];
    const initiated = new Date(root.initiatedAtLocal).getTime();
    
    // Find absolute latest completion timestamp
    let maxCompleted = initiated;
    nodes.forEach(n => {
      if (n.completedAtLocal) {
        const ms = new Date(n.completedAtLocal).getTime();
        if (ms > maxCompleted) maxCompleted = ms;
      }
    });

    return Math.max(0, maxCompleted - initiated);
  }, [nodes]);

  const p95Latency = React.useMemo(() => {
    if (!nodes.length) return 0;
    const durations = nodes
      .map(n => {
        if (!n.completedAtLocal) return 0;
        return new Date(n.completedAtLocal).getTime() - new Date(n.initiatedAtLocal).getTime();
      })
      .sort((a, b) => a - b);
    
    const index = Math.floor(durations.length * 0.95);
    return durations[index] || 0;
  }, [nodes]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      
      {/* Total Latency Widget */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
        <Clock size={18} style={{ color: 'var(--accent-teal)', marginBottom: '0.4rem' }} />
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {totalDuration}ms
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>
          Total Trace Latency
        </span>
      </div>

      {/* Nodes Visible */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
        <Eye size={18} style={{ color: 'var(--accent-blue)', marginBottom: '0.4rem' }} />
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {nodes.length}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>
          Visible Spans
        </span>
      </div>

      {/* Visual Wires */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
        <Network size={18} style={{ color: 'var(--accent-pink)', marginBottom: '0.4rem' }} />
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {wires.length}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>
          Snapped Wires
        </span>
      </div>

      {/* P95 Hop */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
        <Disc size={18} style={{ color: 'var(--accent-purple)', marginBottom: '0.4rem' }} />
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {p95Latency}ms
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>
          P95 Span Latency
        </span>
      </div>

      {/* Incidents / Errors */}
      <div className="glass-card" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        textAlign: 'center', 
        padding: '1rem',
        border: errors > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
        background: errors > 0 ? 'rgba(239, 68, 68, 0.03)' : 'rgba(255, 255, 255, 0.02)'
      }}>
        <AlertTriangle size={18} style={{ color: errors > 0 ? 'var(--accent-red)' : 'var(--text-muted)', marginBottom: '0.4rem' }} />
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: errors > 0 ? 'var(--accent-red)' : 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {errors}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>
          Unhealthy Spans
        </span>
      </div>

    </div>
  );
};

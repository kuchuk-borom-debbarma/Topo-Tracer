import React from 'react';
import { Sliders, Search, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface TraceControlsProps {
  traceId: string;
  setTraceId: (id: string) => void;
  depth: number;
  setDepth: (d: number) => void;
  maxDepth: number;
  search: string;
  setSearch: (s: string) => void;
  onFetch: () => void;
  isLoading: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export const TraceControls: React.FC<TraceControlsProps> = ({
  traceId,
  setTraceId,
  depth,
  setDepth,
  maxDepth,
  search,
  setSearch,
  onFetch,
  isLoading,
  onExpandAll,
  onCollapseAll
}) => {
  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Fetcher Section */}
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Telemetry Trace Ingestion / Fetcher
          </label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                placeholder="Enter Trace UUID (or 'mock')..."
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(5, 7, 12, 0.6)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') onFetch(); }}
              />
            </div>
            <button
              onClick={onFetch}
              disabled={isLoading}
              className="glow-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0 1.25rem',
                height: '42px',
                fontSize: '0.875rem'
              }}
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Streaming...' : 'Stream'}
            </button>
          </div>
        </div>


        {/* Expand/Collapse Shortcut Deck */}
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tree Branch Toggles
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
            <button
              onClick={onExpandAll}
              className="segment-btn"
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--glass-border)',
                padding: '0.625rem 0.5rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontSize: '0.8125rem'
              }}
            >
              <ZoomIn size={14} />
              Expand All
            </button>
            <button
              onClick={onCollapseAll}
              className="segment-btn"
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--glass-border)',
                padding: '0.625rem 0.5rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontSize: '0.8125rem'
              }}
            >
              <ZoomOut size={14} />
              Collapse All
            </button>
          </div>
        </div>


        {/* Dynamic Zoom Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sliders size={14} />
              Depth Resolution Zoom
            </label>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
              Depth {depth} / {maxDepth}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Macro</span>
            <input
              type="range"
              min="0"
              max={maxDepth}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              style={{
                flex: 1,
                accentColor: 'var(--accent-blue)',
                height: '6px',
                background: 'rgba(5, 7, 12, 0.8)',
                borderRadius: '3px',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Micro</span>
          </div>
        </div>

        {/* Live Filter Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search nodes by name, container, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(5, 7, 12, 0.4)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.625rem 1rem 0.625rem 2.5rem',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'all 0.2s'
            }}
          />
        </div>

      </div>
    </div>
  );
};

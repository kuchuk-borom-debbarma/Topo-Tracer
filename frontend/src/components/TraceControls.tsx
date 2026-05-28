import React from 'react';
import { Sliders, Search, Globe, Link, RefreshCw, ZoomIn, ZoomOut, UploadCloud } from 'lucide-react';

interface TraceControlsProps {
  traceId: string;
  setTraceId: (id: string) => void;
  depth: number;
  setDepth: (d: number) => void;
  maxDepth: number;
  depthType: 'global' | 'local';
  setDepthType: (type: 'global' | 'local') => void;
  search: string;
  setSearch: (s: string) => void;
  onFetch: () => void;
  isLoading: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFileSelect: (file: File) => void;
}

export const TraceControls: React.FC<TraceControlsProps> = ({
  traceId,
  setTraceId,
  depth,
  setDepth,
  maxDepth,
  depthType,
  setDepthType,
  search,
  setSearch,
  onFetch,
  isLoading,
  onExpandAll,
  onCollapseAll,
  onFileSelect
}) => {
  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Fetcher Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Telemetry Trace Ingestion
            </label>
            <button 
              onClick={() => document.getElementById('offline-select')?.click()}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
            >
              <UploadCloud size={12} />
              Upload JSON
            </button>
            <input 
              id="offline-select"
              type="file" 
              accept=".json" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFileSelect(e.target.files[0]);
                }
              }}
              style={{ display: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                placeholder="Trace UUID..."
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(5, 7, 12, 0.6)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.5rem 0.75rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none'
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
                gap: '0.4rem',
                padding: '0 0.75rem',
                height: '34px',
                fontSize: '0.75rem'
              }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? '...' : 'Fetch'}
            </button>
          </div>
        </div>

        {/* Zoom Mode Toggle */}
        <div className="segment-control" style={{ padding: '0.2rem' }}>
          <button
            className={`segment-btn ${depthType === 'global' ? 'active' : ''}`}
            onClick={() => setDepthType('global')}
            style={{ fontSize: '0.75rem', padding: '0.4rem' }}
          >
            <Globe size={12} style={{ marginRight: '0.3rem' }} />
            Global
          </button>
          <button
            className={`segment-btn ${depthType === 'local' ? 'active' : ''}`}
            onClick={() => setDepthType('local')}
            style={{ fontSize: '0.75rem', padding: '0.4rem' }}
          >
            <Link size={12} style={{ marginRight: '0.3rem' }} />
            Local
          </button>
        </div>

        {/* Dynamic Zoom Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Sliders size={12} />
              Depth Zoom
            </label>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
              {depth}/{maxDepth}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={maxDepth}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--accent-blue)',
              height: '4px',
              background: 'rgba(5, 7, 12, 0.8)',
              borderRadius: '2px',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Live Filter Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(5, 7, 12, 0.4)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.75rem 0.4rem 2rem',
              color: 'var(--text-primary)',
              fontSize: '0.8125rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Branch Toggles */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onExpandAll} className="segment-btn" style={{ flex: 1, fontSize: '0.7rem', padding: '0.4rem' }}>
            <ZoomIn size={12} style={{ marginRight: '0.3rem' }} /> Expand
          </button>
          <button onClick={onCollapseAll} className="segment-btn" style={{ flex: 1, fontSize: '0.7rem', padding: '0.4rem' }}>
            <ZoomOut size={12} style={{ marginRight: '0.3rem' }} /> Collapse
          </button>
        </div>

      </div>
    </div>
  );
};

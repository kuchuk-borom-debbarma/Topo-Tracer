import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ZoomIn } from 'lucide-react';
import { fetchTraceLayout } from '../services/api';
import type { TraceLayoutResponse } from '../services/api';

export function TraceGraph() {
  const { traceId } = useParams<{ traceId: string }>();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<TraceLayoutResponse | null>(null);
  const [maxLevel, setMaxLevel] = useState<number>(30); // Default INFO
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);

  useEffect(() => {
    if (!traceId) return;
    setLoading(true);
    fetchTraceLayout(traceId, maxLevel)
      .then((data) => {
        setLayout(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [traceId, maxLevel]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (loading && !layout) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading visualization...</div>;
  }

  if (error) {
    return <div className="p-8 text-center" style={{ color: 'var(--color-level-error)' }}>Error: {error}</div>;
  }

  if (!layout || layout.spans.length === 0) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>No spans found for this trace.</div>;
  }

  // Calculate timeline metrics
  const minStart = Math.min(...layout.spans.map(s => s.startTimeUs));
  const maxEnd = Math.max(...layout.spans.map(s => s.endTimeUs || s.startTimeUs));
  const totalDuration = Math.max(1, maxEnd - minStart);

  const getLevelClass = (level: number) => {
    if (level <= 10) return 'level-10';
    if (level <= 20) return 'level-20';
    if (level <= 30) return 'level-30';
    if (level <= 40) return 'level-40';
    return 'level-50';
  };

  const getLevelLabel = (level: number) => {
    if (level <= 10) return 'TRACE';
    if (level <= 20) return 'DEBUG';
    if (level <= 30) return 'INFO';
    if (level <= 40) return 'WARN';
    return 'ERROR';
  };

  const spanIndexMap = new Map<string, number>();
  layout.spans.forEach((s, idx) => spanIndexMap.set(s.id, idx));

  // Compute SVG Paths for edges
  const renderEdges = () => {
    return layout.edges.map((edge) => {
      const fromIdx = spanIndexMap.get(edge.fromSpanId);
      const toIdx = spanIndexMap.get(edge.toSpanId);
      if (fromIdx === undefined || toIdx === undefined) return null;

      const fromSpan = layout.spans[fromIdx];
      const toSpan = layout.spans[toIdx];

      const fromLeftPct = (fromSpan.startTimeUs - minStart) / totalDuration;
      const fromWidthPct = fromSpan.durationUs ? (fromSpan.durationUs / totalDuration) : 0;
      
      const toLeftPct = (toSpan.startTimeUs - minStart) / totalDuration;
      
      // Starting point: middle of the 'from' bar
      const startX = width * (fromLeftPct + fromWidthPct / 2);
      const startY = fromIdx * 40 + 20;

      // Ending point: start of the 'to' bar
      const endX = width * toLeftPct;
      const endY = toIdx * 40 + 20;

      // Cubic bezier curve
      const dx = Math.max(Math.abs(endX - startX) * 0.5, 30);
      const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

      return (
        <g key={edge.id}>
          <path 
            d={path} 
            className={`edge-path ${edge.isGhost ? 'ghost' : ''}`}
          />
          {edge.ghostCount && edge.ghostCount > 1 && (
            <text 
              x={(startX + endX) / 2} 
              y={(startY + endY) / 2 - 10} 
              fill="var(--text-secondary)"
              fontSize="10px"
              textAnchor="middle"
            >
              {edge.ghostCount}x calls
            </text>
          )}
        </g>
      );
    });
  };

  return (
    <div className="trace-view-container">
      <header className="trace-toolbar">
        <button 
          onClick={() => navigate('/')} 
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <div style={{ flex: 1, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
          Trace: {traceId}
        </div>
        
        <div className="slider-container">
          <ZoomIn className="w-4 h-4 text-slate-400" />
          <span className="slider-label">Max Level</span>
          <input 
            type="range" 
            min="10" 
            max="50" 
            step="10"
            value={maxLevel} 
            onChange={(e) => setMaxLevel(parseInt(e.target.value))}
          />
          <span className="slider-value">{getLevelLabel(maxLevel)}</span>
        </div>
      </header>

      <main className="trace-graph-area" ref={containerRef}>
        {/* Draw timeline grid lines */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
          {[0, 25, 50, 75, 100].map(pct => (
            <div key={pct} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ position: 'absolute', top: 4, left: 4, fontSize: '10px', color: 'var(--text-tertiary)' }}>
                {((totalDuration * (pct / 100)) / 1000).toFixed(1)}ms
              </span>
            </div>
          ))}
        </div>

        <div className="gantt-container" style={{ height: layout.spans.length * 40 }}>
          {/* SVG Overlay */}
          <svg className="edges-overlay">
            {renderEdges()}
          </svg>

          {/* HTML DOM Bars */}
          {layout.spans.map((span) => {
            const left = ((span.startTimeUs - minStart) / totalDuration) * 100;
            const widthPct = span.durationUs ? ((span.durationUs) / totalDuration) * 100 : 0.5; // Ensure at least a sliver is visible
            
            return (
              <div key={span.id} className="gantt-row">
                {/* Text Label on the left or next to bar */}
                <div style={{ 
                  position: 'absolute', 
                  left: 8, 
                  zIndex: 10,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)'
                  }}>
                    {span.groupName}
                  </span>
                  {span.name}
                </div>

                {/* The Gantt Bar */}
                <div 
                  className="gantt-bar-wrapper"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(widthPct, 0.5)}%`,
                    minWidth: '24px' // So it's always clickable
                  }}
                  title={`${span.name} (${span.durationUs ? (span.durationUs/1000).toFixed(2) : 0}ms)`}
                >
                  <div className={`gantt-bar ${getLevelClass(span.level)}`}>
                    <span className="gantt-bar-label">{span.durationUs ? (span.durationUs/1000).toFixed(1) + 'ms' : ''}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

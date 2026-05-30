import React, { useState, useEffect } from 'react';
import { fetchTraces } from '../services/api';
import type { TraceSummary, PaginatedResult } from '../services/api';
import { Calendar, Hash, ChevronLeft, ChevronRight, Loader2, Play } from 'lucide-react';

interface TraceListProps {
  onSelectTrace: (traceId: string) => void;
}

export const TraceList: React.FC<TraceListProps> = ({ onSelectTrace }) => {
  const [result, setResult] = useState<PaginatedResult<TraceSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTraces = async (beforeTime?: number, afterTime?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTraces(20, beforeTime, afterTime);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch traces. Ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTraces();
  }, []);

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--accent-red)' }}>
        <p>{error}</p>
        <button 
          onClick={() => loadTraces()}
          style={{ 
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            background: 'var(--accent-blue)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Available Traces</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            disabled={isLoading || !result?.pagination.hasPrev}
            onClick={() => loadTraces(undefined, result?.pagination.prevTimeCursor || undefined)}
            className="btn-secondary"
            style={{ padding: '0.4rem' }}
          >
            <ChevronLeft size={18} />
          </button>
          <button 
            disabled={isLoading || !result?.pagination.hasNext}
            onClick={() => loadTraces(result?.pagination.nextTimeCursor || undefined)}
            className="btn-secondary"
            style={{ padding: '0.4rem' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent-blue)' }} />
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>ROOT TRANSACTION</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>START TIME</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>NODES</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>TRACE ID</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {result?.data.map((trace) => (
                <tr 
                  key={trace.traceId} 
                  style={{ borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s' }}
                  className="hover-row"
                >
                  <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                    {trace.rootNodeName}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                      <Calendar size={14} />
                      {new Date(trace.startTime).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                      <Hash size={14} />
                      {trace.nodeCount}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {trace.traceId.substring(0, 8)}...
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button 
                      onClick={() => onSelectTrace(trace.traceId)}
                      className="btn-primary"
                      style={{ 
                        padding: '0.4rem 0.75rem', 
                        fontSize: '0.75rem', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.4rem' 
                      }}
                    >
                      <Play size={12} fill="currentColor" />
                      View Trace
                    </button>
                  </td>
                </tr>
              ))}
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No traces found in ClickHouse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

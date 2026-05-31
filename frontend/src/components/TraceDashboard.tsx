import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock } from 'lucide-react';
import { fetchTraces } from '../services/api';
import type { TraceListItem } from '../services/api';

export function TraceDashboard() {
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTraces()
      .then((data) => {
        setTraces(data.traces);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="main-content">
      <header className="app-header">
        <div className="app-title">
          <Activity className="w-6 h-6 text-emerald-400" />
          Topo-Tracer
        </div>
      </header>

      <div className="trace-table-container">
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>Recent Traces</h2>
          
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading traces...</div>
          ) : error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-level-error)' }}>Error: {error}</div>
          ) : traces.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No traces found.</div>
          ) : (
            <table className="trace-table">
              <thead>
                <tr>
                  <th>Trace ID</th>
                  <th>Spans</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((t) => (
                  <tr key={t.traceId} onClick={() => navigate(`/trace/${t.traceId}`)}>
                    <td style={{ fontFamily: 'monospace' }}>{t.traceId}</td>
                    <td>{t.spanCount}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock className="w-4 h-4 text-slate-400" />
                        {new Date(Number(t.createdAt)).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

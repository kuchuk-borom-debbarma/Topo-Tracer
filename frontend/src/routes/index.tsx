import { createRoute, useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Route as rootRoute } from './__root';

function Index() {
  const [traceId, setTraceId] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (traceId.trim()) {
      navigate({ to: '/trace/$traceId', params: { traceId: traceId.trim() } });
    }
  };

  return (
    <div style={{ padding: '3rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem', background: 'linear-gradient(to right, var(--accent-cyan), var(--accent-purple))', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          Explore Traces
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Enter a trace ID to visualize the distributed execution topology.
        </p>
      </div>

      <form onSubmit={handleSearch} className="glass-panel" style={{ display: 'flex', padding: '0.5rem', borderRadius: 'var(--border-radius-lg)', alignItems: 'center' }}>
        <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>
          <Search size={20} />
        </div>
        <input 
          type="text" 
          value={traceId}
          onChange={(e) => setTraceId(e.target.value)}
          placeholder="e.g. tx_987654321_kbd"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '1.1rem', padding: '0.75rem' }}
        />
        <button type="submit" className="btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-purple)', color: '#fff', borderRadius: 'var(--border-radius-md)' }}>
          Analyze
        </button>
      </form>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
});

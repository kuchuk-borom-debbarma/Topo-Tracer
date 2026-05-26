import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import { Activity, LayoutDashboard, Settings } from 'lucide-react';

function Shell() {
  return (
    <div className="app-shell" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <nav className="sidebar glass-panel" style={{ width: '260px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--glass-border)', padding: '1.5rem', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
          <div style={{ background: 'var(--accent-cyan)', padding: '0.5rem', borderRadius: 'var(--border-radius-md)', display: 'flex' }}>
            <Activity size={24} color="#000" />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, letterSpacing: '-0.5px' }}>Topo Tracer</h1>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-md)', color: 'var(--text-secondary)', transition: 'all var(--transition-fast)' }} activeProps={{ style: { background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' } }}>
            <LayoutDashboard size={18} />
            <span style={{ fontWeight: 500 }}>Dashboard</span>
          </Link>
          <Link to="/trace/$traceId" params={{ traceId: 'default_trace' }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-md)', color: 'var(--text-secondary)', transition: 'all var(--transition-fast)' }} activeProps={{ style: { background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' } }}>
            <Activity size={18} />
            <span style={{ fontWeight: 500 }}>Live Trace</span>
          </Link>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
           <button className="btn" style={{ justifyContent: 'flex-start', width: '100%', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
             <Settings size={18} />
             <span>Settings</span>
           </button>
        </div>
      </nav>
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createRootRoute({
  component: Shell,
});

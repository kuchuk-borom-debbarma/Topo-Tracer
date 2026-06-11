import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { fetchCurrentUser } from "../api";
import { clearToken } from "../auth";
import { Icon } from "./Icon";

export function AppShell() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
  });
  const user = userQuery.data?.user;

  const logout = () => {
    clearToken();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="application">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol"><Icon name="graph" /></div>
          <div className="brand-copy">
            <strong>Topo Tracer</strong>
            <span>Trace intelligence</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)}>
            <Icon name="x" />
          </button>
        </div>

        <nav className="primary-nav">
          <span className="nav-label">Workspace</span>
          <Link
            to="/traces"
            search={{ page: 1 }}
            className="nav-link"
            activeProps={{ className: "nav-link active" }}
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="activity" />
            <span>Trace explorer</span>
            <span className="nav-pulse" />
          </Link>
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-icon"><Icon name="shield" /></div>
          <div>
            <strong>Read model online</strong>
            <p>Bounded queries and tenant-scoped graph projections are active.</p>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-avatar">{(user?.username || user?.email || "U")[0].toUpperCase()}</div>
          <div className="user-copy">
            <strong>{user?.username || "Workspace user"}</strong>
            <span>{user?.email || "Loading profile..."}</span>
          </div>
          <button className="icon-button" onClick={logout} aria-label="Sign out">
            <Icon name="log-out" />
          </button>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <section className="application-main">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Icon name="menu" />
          </button>
          <div className="mobile-brand"><span>Topo</span> Tracer</div>
          <div className="live-badge"><span /> Live</div>
        </header>
        <Outlet />
      </section>
    </div>
  );
}

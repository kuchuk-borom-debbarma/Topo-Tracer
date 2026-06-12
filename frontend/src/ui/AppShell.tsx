import { Link, Outlet } from "@tanstack/react-router";
import { Icon } from "./Icon";

export function AppShell() {
  return (
    <div className="application">
      <nav className="top-nav" aria-label="Workspace navigation">
        <Link to="/traces" search={{ page: 1 }} className="top-nav-link">
          <Icon name="graph" />
          Traces
        </Link>
        <Link to="/settings/api-keys" className="top-nav-link">
          <Icon name="shield" />
          API keys
        </Link>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

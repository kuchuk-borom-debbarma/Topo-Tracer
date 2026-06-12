import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { clearToken } from "../auth";
import { fetchCurrentUser } from "../api";
import { Icon } from "./Icon";

export function AppShell() {
  const navigate = useNavigate();
  const pathname = window.location.pathname;
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 60_000,
  });

  const user = userQuery.data?.user ?? null;
  const routeMeta = getRouteMeta(pathname);

  const handleLogout = () => {
    clearToken();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="application shell-layout">
      <aside className="sidebar workspace-sidebar">
        <div className="sidebar-top">
          <Link to="/traces" search={{ page: 1 }} className="brand workspace-brand">
            <span className="brand-symbol">
              <Icon name="graph" />
            </span>
            <span className="brand-copy">
              <strong>Topo Tracer</strong>
              <span>Trace graph</span>
            </span>
          </Link>

          <div className="nav-label">Workspace</div>
          <nav className="primary-nav" aria-label="Workspace navigation">
            <Link
              to="/traces"
              search={{ page: 1 }}
              className={`nav-link ${pathname.startsWith("/traces") ? "active" : ""}`}
            >
              <Icon name="graph" />
              <span>Traces</span>
            </Link>
            <Link
              to="/settings/api-keys"
              className={`nav-link ${pathname.startsWith("/settings/api-keys") ? "active" : ""}`}
            >
              <Icon name="shield" />
              <span>API keys</span>
            </Link>
          </nav>

          <section className="sidebar-card workspace-card">
            <div className="workspace-card-icon">
              <Icon name="spark" />
            </div>
            <div>
              <strong>Operator flow</strong>
              <p>Review traces, rotate keys, and keep your telemetry session under control from one place.</p>
            </div>
          </section>
        </div>

        <div className="sidebar-footer workspace-account">
          <div className="account-chip">
            <div className="user-avatar">{getInitials(user?.username ?? user?.email ?? "TT")}</div>
            <div className="user-copy">
              <strong>{user?.username ?? "Authenticated user"}</strong>
              <span>{user?.email ?? "Loading account details..."}</span>
            </div>
          </div>

          <div className="account-meta">
            <span>{user ? `Member since ${formatMemberSince(user.createdAt)}` : accountStatus(userQuery.isLoading, userQuery.isError)}</span>
          </div>

          <div className="account-actions">
            <Link to="/settings/api-keys" className="button subtle account-button">
              <Icon name="shield" />
              Manage keys
            </Link>
            <button type="button" className="button primary account-button" onClick={handleLogout}>
              <Icon name="log-out" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <h1>{routeMeta.title}</h1>
          </div>

          <div className="workspace-topbar-actions">
            <Link to="/settings/api-keys" className="button subtle workspace-action-link">
              <Icon name="shield" />
              API keys
            </Link>
            <button type="button" className="button subtle workspace-action-link" onClick={handleLogout}>
              <Icon name="log-out" />
              Sign out
            </button>
          </div>
        </header>

        <main className="main-content shell-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function getRouteMeta(pathname: string): { title: string } {
  if (pathname.startsWith("/settings/api-keys")) {
    return {
      title: "API keys",
    };
  }

  return {
    title: "Traces",
  };
}

function getInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "TT";

  const parts = trimmed.split(/[\s@._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "TT";
}

function formatMemberSince(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "recently";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function accountStatus(isLoading: boolean, isError: boolean): string {
  if (isLoading) return "Loading account details";
  if (isError) return "Account details unavailable";
  return "Authenticated session";
}

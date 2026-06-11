import { Outlet } from "@tanstack/react-router";

export function AppShell() {
  return (
    <div className="application">
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

import { useState } from "react";
import { Outlet, Link } from "@tanstack/react-router";
import { SettingsModal } from "../components/SettingsModal";
import { getApiBaseUrl } from "../api/client";

export function RootLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const apiUrl = getApiBaseUrl();
  const displayUrl = apiUrl.replace(/https?:\/\//, "");

  return (
    <>
      {/* Navigation */}
      <nav className="nav">
        <Link to="/" className="nav-logo">
          <div className="nav-logo-icon">⬡</div>
          <span>Topo<span>Tracer</span></span>
        </Link>

        <div className="nav-spacer" />

        <div className="nav-badge">
          <div className="dot" />
          <span>{displayUrl}</span>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowSettings(true)}
          id="settings-btn"
          title="Configure API connection"
        >
          ⚙️ Settings
        </button>
      </nav>

      {/* Page content */}
      <div className="page">
        <Outlet />
      </div>

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}

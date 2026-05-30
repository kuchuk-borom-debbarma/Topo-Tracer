import { useState } from "react";
import { getApiBaseUrl, setApiBaseUrl } from "../api/client";

type Props = {
  onClose: () => void;
};

export function SettingsModal({ onClose }: Props) {
  const [url, setUrl] = useState(getApiBaseUrl());
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const trimmed = url.trim().replace(/\/$/, "");
    if (!trimmed) return;
    setApiBaseUrl(trimmed);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
      window.location.reload();
    }, 800);
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="modal-title" id="settings-title">
          ⚙️ API Connection
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="api-url-input">
            Backend Base URL
          </label>
          <input
            id="api-url-input"
            className="input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose();
            }}
          />
          <p className="form-hint">
            The carno.js backend URL. Stored in localStorage.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--accent-primary-bg)",
            border: "1px solid var(--accent-primary-glow)",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
          <span>
            When using <code>npm run dev</code>, keep this as{" "}
            <code>http://localhost:3000</code> — the Vite proxy forwards all{" "}
            <code>/telemetry</code> requests automatically.
          </span>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saved}
          >
            {saved ? "✓ Saved" : "Save & Reconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}

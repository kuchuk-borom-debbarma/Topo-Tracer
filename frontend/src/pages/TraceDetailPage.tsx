import { useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTraceLayout, queryKeys } from "../api/client";
import { TraceFlowCanvas } from "../components/TraceFlowCanvas";
import { downloadFlowAsPDF } from "../utils/pdf";
import { formatDuration } from "../utils/layout";

export function TraceDetailPage() {
  const { traceId } = useParams({ strict: false }) as { traceId: string };
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // V4 visual detail zoom level state (default to undefined for full initial load)
  const [activeLevel, setActiveLevel] = useState<number | undefined>(undefined);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"graph" | "dag" | "nested">("graph");
  const [showLegend, setShowLegend] = useState(true);

  // Fetch the pre-filtered V4 layout from the backend
  const layoutQuery = useQuery({
    queryKey: queryKeys.traceLayout(traceId, activeLevel),
    queryFn: () => fetchTraceLayout(traceId, activeLevel),
    staleTime: 30_000,
  });

  const data = layoutQuery.data;
  const isLoading = layoutQuery.isLoading;
  const isError = layoutQuery.isError;
  const error = layoutQuery.error;
  const isFetching = layoutQuery.isFetching && !layoutQuery.isLoading;

  async function handleDownloadPDF() {
    if (!canvasRef.current) return;
    setIsPdfExporting(true);
    try {
      await downloadFlowAsPDF(canvasRef.current, traceId);
    } finally {
      setIsPdfExporting(false);
    }
  }

  const metadata = data?.metadata;
  const levelNames = metadata?.levelNames || {};
  
  // Dynamic maximum level actually present in the trace spans
  const maxLevelAvailable = metadata?.maxLevel ?? 3;

  // Active level defaults to absolute maximum level available
  const currentActiveLevel = activeLevel !== undefined ? activeLevel : maxLevelAvailable;

  const containerCount = data?.containers.length ?? 0;
  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  // Compute total trace duration
  const totalDurationUs =
    data && data.containers.length > 0
      ? Math.max(...data.containers.map((c) => c.startTimeUs + (c.durationUs ?? 0))) -
        Math.min(...data.containers.map((c) => c.startTimeUs))
      : null;

  return (
    <div className="flow-page">
      {/* Top bar */}
      <div className="flow-topbar">
        <div className="flow-topbar-left">
          <Link to="/" className="flow-back-btn">
            ← Back
          </Link>
          <div className="flow-trace-id" title={traceId}>
            {traceId}
          </div>
          {data && (
            <span className="badge badge-ready">
              ✓ Materialized
            </span>
          )}
          {isFetching && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <div
                className="spinner"
                style={{ width: 14, height: 14, borderWidth: 1.5 }}
              />
              Updating…
            </div>
          )}
        </div>

        <div className="flow-topbar-right">
          {/* Dynamic V4 Level-of-Detail (LOD) Zoom Slider */}
          {data && (
            <div className="tag-filter-bar" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="tag-filter-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                🔍 Zoom Level:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="range"
                  min={0}
                  max={maxLevelAvailable}
                  value={currentActiveLevel}
                  onChange={(e) => setActiveLevel(parseInt(e.target.value, 10))}
                  style={{
                    width: 130,
                    accentColor: "var(--accent-primary)",
                    cursor: "pointer",
                  }}
                />
                <span
                  className="badge badge-ready"
                  style={{
                    fontSize: 11,
                    background: "rgba(10,12,22,0.85)",
                    borderColor: "var(--accent-primary)",
                    color: "var(--accent-primary)",
                    padding: "4px 8px",
                    fontWeight: "600",
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  [{currentActiveLevel}/{maxLevelAvailable}] {levelNames[currentActiveLevel] || "Detail View"}
                </span>
              </div>
            </div>
          )}

          {/* Layout Mode Selector Toggle Pill */}
          <div className="zoom-levels" style={{ marginRight: 8 }}>
            <button
              className={`zoom-level-btn ${layoutMode === "graph" ? "active" : ""}`}
              onClick={() => setLayoutMode("graph")}
              title="Switch to Clustered Graph view"
            >
              🕸️ Graph View
            </button>
            <button
              className={`zoom-level-btn ${layoutMode === "dag" ? "active" : ""}`}
              onClick={() => setLayoutMode("dag")}
              title="Switch to Flowchart DAG view"
            >
              📊 Flowchart View
            </button>
            <button
              className={`zoom-level-btn ${layoutMode === "nested" ? "active" : ""}`}
              onClick={() => setLayoutMode("nested")}
              title="Switch to Nesting Swimlanes view"
            >
              🔲 Swimlane View
            </button>
          </div>

          <button
            id="download-pdf-btn"
            className="btn btn-primary"
            onClick={() => void handleDownloadPDF()}
            disabled={isPdfExporting || !data}
          >
            {isPdfExporting ? (
              <>
                <div
                  className="spinner"
                  style={{ width: 14, height: 14, borderWidth: 1.5 }}
                />
                Exporting…
              </>
            ) : (
              "⬇ Download PDF"
            )}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="trace-info-bar">
          <div className="trace-stat">
            Containers: <span className="trace-stat-value">{containerCount}</span>
          </div>
          <div className="trace-stat">
            Nodes: <span className="trace-stat-value">{nodeCount}</span>
          </div>
          <div className="trace-stat">
            Edges: <span className="trace-stat-value">{edgeCount}</span>
          </div>
          {totalDurationUs !== null && (
            <div className="trace-stat">
              Duration:{" "}
              <span className="trace-stat-value">
                {formatDuration(totalDurationUs)}
              </span>
            </div>
          )}
          <div className="trace-stat">
            Active Detail:{" "}
            <span className="trace-stat-value" style={{ color: "var(--accent-primary)" }}>
              [{currentActiveLevel}/{maxLevelAvailable}] {levelNames[currentActiveLevel] || "Detail View"}
            </span>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flow-canvas-wrapper" style={{ position: "relative" }}>
        {isLoading ? (
          <div
            className="loading-overlay"
            style={{ flexDirection: "column", gap: 16 }}
          >
            <div
              className="spinner"
              style={{ width: 32, height: 32, borderWidth: 3 }}
            />
            <span>Loading trace layout…</span>
          </div>
        ) : isError ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">Failed to load trace</div>
            <div className="empty-state-desc">
              {error instanceof Error ? error.message : "An error occurred."}
              <br />
              The trace may not be materialized yet.
            </div>
          </div>
        ) : data ? (
          <TraceFlowCanvas
            ref={canvasRef}
            data={data}
            activeLevel={currentActiveLevel}
            onSelectLevel={setActiveLevel}
            layoutMode={layoutMode}
          />
        ) : null}
      </div>

      {/* Floating Legend */}
      {showLegend ? (
        <div className="diagram-legend">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div className="diagram-legend-title" style={{ margin: 0 }}>Legend</div>
            <button
              className="legend-close-btn"
              onClick={() => setShowLegend(false)}
              title="Hide Legend"
            >
              ✕
            </button>
          </div>
          <div className="diagram-legend-item">
            <svg width="36" height="12" className="diagram-legend-svg">
              <line x1="0" y1="6" x2="28" y2="6" stroke="var(--accent-primary)" strokeWidth="1.5" />
              <polygon points="26,3 34,6 26,9" fill="var(--accent-primary)" opacity="0.8" />
            </svg>
            <span>Direct call</span>
          </div>
          <div className="diagram-legend-item">
            <svg width="36" height="12" className="diagram-legend-svg">
              <line x1="0" y1="6" x2="28" y2="6" stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="5 3" />
              <polygon points="26,3 34,6 26,9" fill="var(--accent-primary)" opacity="0.8" />
            </svg>
            <span>Indirect snapped call</span>
          </div>
        </div>
      ) : (
        <button
          className="legend-toggle-btn"
          onClick={() => setShowLegend(true)}
          title="Show Legend"
        >
          ℹ️
        </button>
      )}
    </div>
  );
}

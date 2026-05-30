import { useRef, useState, useMemo, useEffect } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTraceLayout, queryKeys } from "../api/client";
import { TraceFlowCanvas } from "../components/TraceFlowCanvas";
import { downloadFlowAsPDF } from "../utils/pdf";
import { formatDuration } from "../utils/layout";

export function TraceDetailPage() {
  const { traceId } = useParams({ strict: false }) as { traceId: string };
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStep, setPlaybackStep] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<"graph" | "dag" | "nested">("graph");

  const activeTagsArray = Array.from(activeTags);

  // Fetch the V3 trace layout containing all containers, nodes, and edges
  const layoutQuery = useQuery({
    queryKey: queryKeys.traceLayout(traceId, activeTagsArray),
    queryFn: () => fetchTraceLayout(traceId, activeTagsArray),
    staleTime: 30_000,
  });

  const data = layoutQuery.data;
  const isLoading = layoutQuery.isLoading;
  const isError = layoutQuery.isError;
  const error = layoutQuery.error;
  const isFetching = layoutQuery.isFetching && !layoutQuery.isLoading;

  // Derive sorted chronological items of the trace for the playback timeline
  const chronoItems = useMemo(() => {
    if (!data) return [];
    const items: Array<{ id: string; name: string; type: "node" | "container"; startTimeUs: number }> = [
      ...data.containers.map((c) => ({
        id: c.id,
        name: c.name,
        type: "container" as const,
        startTimeUs: c.startTimeUs,
      })),
      ...data.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: "node" as const,
        startTimeUs: n.startTimeUs,
      })),
    ];
    items.sort((a, b) => a.startTimeUs - b.startTimeUs);
    return items;
  }, [data]);

  // Interval-driven timeline auto-playback runner
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && chronoItems.length > 0) {
      interval = setInterval(() => {
        setPlaybackStep((prev) => {
          if (prev === null) return 0;
          if (prev >= chronoItems.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 850);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, chronoItems]);

  const handleTogglePlay = () => {
    if (playbackStep === chronoItems.length - 1) {
      setPlaybackStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
      if (playbackStep === null) {
        setPlaybackStep(0);
      }
    }
  };

  const handleResetPlayback = () => {
    setIsPlaying(false);
    setPlaybackStep(null);
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setPlaybackStep((prev) => {
      if (prev === null) return 0;
      return Math.min(chronoItems.length - 1, prev + 1);
    });
  };

  const handleStepBackward = () => {
    setIsPlaying(false);
    setPlaybackStep((prev) => {
      if (prev === null) return null;
      if (prev === 0) return null;
      return prev - 1;
    });
  };

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
  const containerCount = data?.containers.length ?? 0;
  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  // Compute total trace duration
  const totalDurationUs =
    data && data.containers.length > 0
      ? Math.max(...data.containers.map((c) => c.startTimeUs + (c.durationUs ?? 0))) -
        Math.min(...data.containers.map((c) => c.startTimeUs))
      : null;

  // Autocomplete tags: filter trace tags based on input and exclude already selected ones
  const availableTags = metadata?.tags || [];
  const autocompleteSuggestions = availableTags.filter(
    (tag) =>
      tag.toLowerCase().includes(tagInput.toLowerCase()) &&
      !activeTags.has(tag)
  );

  const handleAddTag = (tag: string) => {
    const next = new Set(activeTags);
    next.add(tag);
    setActiveTags(next);
    setTagInput("");
    setIsAutocompleteOpen(false);
  };

  const handleRemoveTag = (tag: string) => {
    const next = new Set(activeTags);
    next.delete(tag);
    setActiveTags(next);
  };

  const handleClearTags = () => {
    setActiveTags(new Set());
  };

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
          {metadata && (
            <span
              className={`badge ${metadata.isZoomReady ? "badge-ready" : "badge-pending"}`}
            >
              {metadata.isZoomReady ? "✓ Materialized" : "⏳ Compiling"}
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
          {/* Dynamic V3 Tag Filtering Bar */}
          {metadata && (
            <div className="tag-filter-bar">
              <span className="tag-filter-label">Filter Tags:</span>
              <div className="tag-pills-list">
                {Array.from(activeTags).map((tag) => (
                  <span key={tag} className="tag-pill-active">
                    {tag}
                    <button
                      className="tag-pill-close-btn"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="tag-input-container">
                <input
                  type="text"
                  placeholder="Add tag (AND logic)..."
                  className="tag-filter-input"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setIsAutocompleteOpen(true);
                  }}
                  onFocus={() => setIsAutocompleteOpen(true)}
                  onBlur={() => {
                    // Slight delay to allow clicking suggestions
                    setTimeout(() => setIsAutocompleteOpen(false), 200);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagInput.trim()) {
                      const matched = availableTags.find(
                        (t) => t.toLowerCase() === tagInput.trim().toLowerCase()
                      );
                      if (matched) {
                        handleAddTag(matched);
                      } else {
                        handleAddTag(tagInput.trim());
                      }
                    }
                  }}
                />

                {isAutocompleteOpen && autocompleteSuggestions.length > 0 && (
                  <div className="tag-autocomplete-dropdown">
                    {autocompleteSuggestions.map((tag) => (
                      <div
                        key={tag}
                        className="tag-autocomplete-item"
                        onMouseDown={() => handleAddTag(tag)}
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {activeTags.size > 0 && (
                <button className="tag-clear-btn" onClick={handleClearTags}>
                  Clear Filters
                </button>
              )}
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
          {activeTags.size > 0 && (
            <div className="trace-stat">
              Active Filters:{" "}
              <span className="trace-stat-value" style={{ color: "var(--accent-secondary)" }}>
                {activeTags.size} tags (AND logic)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div className="flow-canvas-wrapper" style={{ position: "relative" }}>
        {/* Legend — always visible, bottom-right of the wrapper */}
        <div className="diagram-legend">
          <div className="diagram-legend-title">Legend</div>
          <div className="diagram-legend-item">
            <svg width="36" height="12" className="diagram-legend-svg">
              <line x1="0" y1="6" x2="30" y2="6" stroke="hsl(258,85%,68%)" strokeWidth="1.5" />
              <polygon points="28,3 36,6 28,9" fill="hsl(258,85%,68%)" opacity="0.75" />
            </svg>
            <span>Parent → child (hierarchy)</span>
          </div>
          <div className="diagram-legend-item">
            <svg width="36" height="12" className="diagram-legend-svg">
              <line x1="0" y1="6" x2="28" y2="6" stroke="hsl(217,91%,62%)" strokeWidth="1.5" />
              <polygon points="26,3 34,6 26,9" fill="hsl(217,91%,62%)" opacity="0.8" />
            </svg>
            <span>Direct call</span>
          </div>
          <div className="diagram-legend-item">
            <svg width="36" height="12" className="diagram-legend-svg">
              <line x1="0" y1="6" x2="28" y2="6" stroke="hsl(217,91%,62%)" strokeWidth="1.5" strokeDasharray="5 3" />
              <polygon points="26,3 34,6 26,9" fill="hsl(217,91%,62%)" opacity="0.8" />
            </svg>
            <span>Indirect call (+N steps)</span>
          </div>
          <div className="diagram-legend-item">
            <svg width="36" height="12" className="diagram-legend-svg">
              <line x1="0" y1="6" x2="28" y2="6" stroke="hsl(280,80%,72%)" strokeWidth="2" />
              <polygon points="26,3 34,6 26,9" fill="hsl(280,80%,72%)" opacity="0.9" />
            </svg>
            <span>Cross-service call</span>
          </div>
        </div>

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
            activeTags={activeTags}
            playbackStep={playbackStep}
            chronoItems={chronoItems}
            layoutMode={layoutMode}
          />
        ) : null}
      </div>

      {/* Floating Glassmorphic Playback timeline deck */}
      {data && chronoItems.length > 0 && (
        <div className="playback-deck">
          <div className="playback-controls">
            <button
              className="playback-btn"
              onClick={handleResetPlayback}
              title="Reset Flow"
              disabled={playbackStep === null}
            >
              ⏮
            </button>
            <button
              className="playback-btn"
              onClick={handleStepBackward}
              title="Step Backward"
              disabled={playbackStep === null}
            >
              ◀
            </button>
            <button
              className="playback-btn playback-btn-primary"
              onClick={handleTogglePlay}
              title={isPlaying ? "Pause Flow" : "Play Flow"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              className="playback-btn"
              onClick={handleStepForward}
              title="Step Forward"
              disabled={playbackStep === chronoItems.length - 1}
            >
              ▶
            </button>
          </div>

          <div className="playback-slider-container">
            <div className="playback-meta">
              <span>
                {playbackStep === null
                  ? "SYSTEM STATE: FULL OVERVIEW"
                  : `TIMELINE STEP: ${playbackStep + 1} / ${chronoItems.length}`}
              </span>
              <span>
                {playbackStep === null
                  ? ""
                  : `${((chronoItems[playbackStep]?.startTimeUs ?? 0) / 1000).toFixed(1)}ms`}
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max={chronoItems.length - 1}
              value={playbackStep === null ? -1 : playbackStep}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setIsPlaying(false);
                setPlaybackStep(val === -1 ? null : val);
              }}
              className="playback-slider"
            />
          </div>

          <div className="playback-status" title={playbackStep === null ? "Displaying full static trace topology" : `Executing: ${chronoItems[playbackStep]?.name}`}>
            {playbackStep === null ? (
              "Full static topology"
            ) : (
              <>
                {chronoItems[playbackStep]?.name}
                <span className="playback-step-tag">
                  {chronoItems[playbackStep]?.type}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

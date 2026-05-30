import { useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTraceLayout, queryKeys } from "../api/client";
import { TraceFlowCanvas } from "../components/TraceFlowCanvas";
import { downloadFlowAsPDF } from "../utils/pdf";
import { formatDuration, getZoomLevelDesc } from "../utils/layout";

export function TraceDetailPage() {
  const { traceId } = useParams({ strict: false }) as { traceId: string };
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number | null>(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);

  // Initial fetch at max depth to discover maxAvailableDepth
  const initQuery = useQuery({
    queryKey: queryKeys.traceLayout(traceId, 9999),
    queryFn: () => fetchTraceLayout(traceId, 9999),
    staleTime: 60_000,
  });

  const maxDepth = initQuery.data?.metadata.maxAvailableDepth ?? 2;
  const activeZoom = zoomLevel ?? maxDepth;

  // Fetch at the requested zoom level (after we know maxDepth)
  const layoutQuery = useQuery({
    queryKey: queryKeys.traceLayout(traceId, activeZoom),
    queryFn: () => fetchTraceLayout(traceId, activeZoom),
    enabled: !initQuery.isLoading,
    staleTime: 30_000,
  });

  const data = layoutQuery.data ?? initQuery.data;
  const isLoading = initQuery.isLoading;
  const isError = initQuery.isError || layoutQuery.isError;
  const error = initQuery.error ?? layoutQuery.error;
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
  const blockCount = data?.blocks.length ?? 0;
  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  // Compute total trace duration
  const totalDurationUs =
    data && data.blocks.length > 0
      ? data.blocks.reduce((max, b) => {
          const end = b.startTimeUs + (b.durationUs ?? 0);
          return end > max ? end : max;
        }, 0) - Math.min(...data.blocks.map((b) => b.startTimeUs))
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
          {metadata && (
            <span
              className={`badge ${metadata.isZoomReady ? "badge-ready" : "badge-pending"}`}
            >
              {metadata.isZoomReady ? "✓ Ready" : "⏳ Compiling"}
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
          {/* Zoom level controls — per dynamic-zoom-system-spec */}
          {!initQuery.isLoading && (
            <div className="zoom-bar">
              <span className="zoom-label">Zoom</span>
              <div className="zoom-levels">
                {Array.from({ length: maxDepth + 1 }, (_, i) => i).map(
                  (level) => (
                    <button
                      key={level}
                      id={`zoom-level-${level}`}
                      className={`zoom-level-btn${activeZoom === level && zoomLevel !== null ? " active" : ""}`}
                      onClick={() => setZoomLevel(level)}
                      title={getZoomLevelDesc(level)}
                    >
                      {level}
                    </button>
                  )
                )}
                <button
                  id="zoom-level-all"
                  className={`zoom-level-btn${zoomLevel === null ? " active" : ""}`}
                  onClick={() => setZoomLevel(null)}
                  title="Show all zoom levels"
                >
                  All
                </button>
              </div>
              <span className="zoom-desc">{getZoomLevelDesc(activeZoom)}</span>
            </div>
          )}

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
            Zoom:{" "}
            <span className="trace-stat-value">
              {activeZoom} / {maxDepth}
            </span>
          </div>
          <div className="trace-stat">
            Blocks: <span className="trace-stat-value">{blockCount}</span>
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
          {metadata?.currentDepth !== undefined && (
            <div className="trace-stat">
              Depth filter:{" "}
              <span className="trace-stat-value">
                {getZoomLevelDesc(metadata.currentDepth)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div className="flow-canvas-wrapper">
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
              The trace may not be materialized yet — wait 10 seconds and
              refresh.
            </div>
          </div>
        ) : data ? (
          <TraceFlowCanvas ref={canvasRef} data={data} />
        ) : null}
      </div>
    </div>
  );
}

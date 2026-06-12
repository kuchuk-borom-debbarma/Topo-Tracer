import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { fetchTraces } from "../api";
import {
  diagnosticCount,
  formatCompactNumber,
  formatDate,
  formatDuration,
  formatImportance,
  relativeTime,
  shortId,
} from "../utils";
import { Icon } from "./Icon";

const PAGE_SIZE = 15;

export function TraceListPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { page?: number };
  const page = search.page ?? 1;
  const [filter, setFilter] = useState("");
  const tracesQuery = useQuery({
    queryKey: ["traces", page, PAGE_SIZE],
    queryFn: () => fetchTraces({ page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const result = tracesQuery.data;
  const traces = useMemo(() => {
    const value = filter.trim().toLowerCase();
    if (!value) return result?.traces ?? [];

    return (result?.traces ?? []).filter((trace) => {
      return (
        trace.traceId.toLowerCase().includes(value) ||
        trace.name.toLowerCase().includes(value)
      );
    });
  }, [filter, result?.traces]);

  const totalNodes = result?.traces.reduce((sum, trace) => sum + trace.nodeCount, 0) ?? 0;
  const activeTraces = result?.traces.filter((trace) => trace.endedAt === null).length ?? 0;
  const issueCount =
    result?.traces.reduce((sum, trace) => sum + diagnosticCount(trace), 0) ?? 0;

  const goToPage = (nextPage: number) => {
    navigate({
      to: "/traces",
      search: { page: nextPage },
    });
  };

  return (
    <main className="page trace-list-page trace-dashboard-page">
      <section className="trace-dashboard-hero compact">
        <div className="trace-dashboard-copy">
          <span className="hero-kicker">Trace operations</span>
          <h2>Trace directory</h2>
          <p>Only traces owned by this account appear here.</p>
        </div>

        <div className="trace-dashboard-actions">
          <button
            type="button"
            className="button subtle"
            onClick={() => tracesQuery.refetch()}
            disabled={tracesQuery.isFetching}
          >
            <Icon name="refresh" />
            Refresh
          </button>
          <Link to="/settings/api-keys" className="button primary">
            <Icon name="shield" />
            Manage API keys
          </Link>
        </div>
      </section>

      <section className="trace-dashboard-metrics" aria-label="Trace metrics">
        <MetricCard
          icon="activity"
          label="Live traces"
          value={formatCompactNumber(activeTraces)}
          note="Currently streaming or waiting to finish"
          tone="emerald"
        />
        <MetricCard
          icon="layers"
          label="Nodes in view"
          value={formatCompactNumber(totalNodes)}
          note="Across the traces on this page"
          tone="cyan"
        />
        <MetricCard
          icon="shield"
          label="Diagnostics"
          value={formatCompactNumber(issueCount)}
          note="Materialization warnings worth checking"
          tone="amber"
        />
        <MetricCard
          icon="clock"
          label="Page size"
          value={String(PAGE_SIZE)}
          note="Balanced for quick scanning"
          tone="violet"
        />
      </section>

      <section className="trace-panel trace-dashboard-panel">
        <header className="trace-panel-header trace-dashboard-panel-header">
          <div>
            <span className="panel-kicker">Trace directory</span>
            <h3>Recent traces</h3>
            <p>Search by trace ID or name, then jump directly into the graph explorer.</p>
          </div>

          <label className="search-box trace-search-box">
            <Icon name="search" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search trace ID or name"
              aria-label="Search traces"
            />
          </label>
        </header>

        {tracesQuery.isLoading && <TraceTableSkeleton />}

        {tracesQuery.isError && (
          <div className="large-empty-state">
            <div className="empty-icon">
              <Icon name="terminal" />
            </div>
            <h3>Could not load traces</h3>
            <p>Check that the Hono server is running and your session is still valid.</p>
            <button className="button primary" onClick={() => tracesQuery.refetch()}>
              Try again
            </button>
          </div>
        )}

        {!tracesQuery.isLoading && !tracesQuery.isError && traces.length === 0 && (
          <div className="large-empty-state">
            <div className="empty-icon">
              <Icon name={filter ? "search" : "graph"} />
            </div>
            <h3>{filter ? "No matching traces" : "No traces materialized yet"}</h3>
            <p>
              {filter
                ? "Try a broader search or clear the filter to inspect everything on this page."
                : "Start sending telemetry events and this workspace will populate automatically."}
            </p>
          </div>
        )}

        {!tracesQuery.isLoading && !tracesQuery.isError && traces.length > 0 && (
          <>
            <div className="trace-table-wrap">
              <table className="trace-table trace-dashboard-table">
                <thead>
                  <tr>
                    <th>Trace</th>
                    <th>Status</th>
                    <th>Graph size</th>
                    <th>Health</th>
                    <th>Updated</th>
                    <th aria-label="Open trace" />
                  </tr>
                </thead>
                <tbody>
                  {traces.map((trace) => {
                    const diagnostics = diagnosticCount(trace);
                    const isLive = trace.endedAt === null;
                    const updatedAt = trace.materializedAt;

                    return (
                      <tr
                        key={trace.traceId}
                        className="trace-click-row"
                        tabIndex={0}
                        onClick={() => navigate({
                          to: "/traces/$traceId",
                          params: { traceId: trace.traceId },
                          search: { threshold: trace.minImportanceLevel, cursor: undefined },
                        })}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          navigate({
                            to: "/traces/$traceId",
                            params: { traceId: trace.traceId },
                            search: { threshold: trace.minImportanceLevel, cursor: undefined },
                          });
                        }}
                      >
                        <td>
                          <div className="trace-primary-cell">
                            <span className="trace-row-badge">{trace.name[0]?.toUpperCase() ?? "T"}</span>
                            <div>
                              <strong>{trace.name || shortId(trace.traceId, 14)}</strong>
                              <small>
                                {shortId(trace.traceId, 18)} · Started {formatDate(trace.startedAt)}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${isLive ? "live" : "neutral"}`}>
                            {isLive ? "Active" : "Completed"}
                          </span>
                          <small className="trace-inline-note">
                            {formatDuration(trace.startedAt, trace.endedAt)}
                          </small>
                        </td>
                        <td>
                          <strong>{formatCompactNumber(trace.nodeCount)}</strong>
                          <small>
                            {formatCompactNumber(trace.edgeCount)} edges ·{" "}
                            {formatImportance(trace.minImportanceLevel)} to{" "}
                            {formatImportance(trace.maxImportanceLevel)}
                          </small>
                        </td>
                        <td>
                          <strong>{diagnostics === 0 ? "Healthy" : `${diagnostics} issues`}</strong>
                          <small>
                            {diagnostics === 0
                              ? "No read-model diagnostics reported"
                              : "Review diagnostics before relying on this projection"}
                          </small>
                        </td>
                        <td>
                            <strong>{relativeTime(updatedAt)}</strong>
                            <small>{formatDate(updatedAt)}</small>
                        </td>
                        <td>
                          <Link
                            to="/traces/$traceId"
                            params={{ traceId: trace.traceId }}
                            search={{ threshold: trace.minImportanceLevel, cursor: undefined }}
                            className="row-action"
                            aria-label={`Open trace ${trace.name || trace.traceId}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Icon name="arrow-right" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer className="panel-pagination">
              <span>
                {result?.totalCount
                  ? `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, result.totalCount)} of ${result.totalCount}`
                  : "0 traces"}
              </span>

              <div>
                <button
                  className="pagination-button"
                  onClick={() => goToPage(page - 1)}
                  disabled={!result?.hasPreviousPage}
                >
                  <Icon name="arrow-left" />
                  Previous
                </button>
                <span className="page-number">{page}</span>
                <button
                  className="pagination-button"
                  onClick={() => goToPage(page + 1)}
                  disabled={!result?.hasNextPage}
                >
                  Next
                  <Icon name="arrow-right" />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

function MetricCard(props: {
  icon: "activity" | "layers" | "clock" | "shield";
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className="metric-card trace-dashboard-metric">
      <div className={`metric-icon ${props.tone}`}>
        <Icon name={props.icon} />
      </div>
      <div className="metric-copy">
        <span>{props.label}</span>
        <strong>{props.value}</strong>
        <small>{props.note}</small>
      </div>
    </article>
  );
}

function TraceTableSkeleton() {
  return (
    <div className="trace-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="trace-skeleton-row" />
      ))}
    </div>
  );
}

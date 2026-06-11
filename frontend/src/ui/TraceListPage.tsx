import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { fetchTraces } from "../api";
import {
  diagnosticCount,
  formatCompactNumber,
  formatDate,
  formatDuration,
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
    return (result?.traces ?? []).filter((trace) =>
      trace.traceId.toLowerCase().includes(value)
    );
  }, [filter, result?.traces]);

  const totalNodes = result?.traces.reduce((sum, trace) => sum + trace.nodeCount, 0) ?? 0;
  const activeTraces = result?.traces.filter((trace) => trace.endedAt === null).length ?? 0;
  const issueCount = result?.traces.reduce((sum, trace) => sum + diagnosticCount(trace), 0) ?? 0;

  const goToPage = (nextPage: number) => {
    navigate({ to: "/traces", search: { page: nextPage } });
  };

  return (
    <main className="page trace-list-page">
      <header className="page-header">
        <div>
          <span className="overline">Observability workspace</span>
          <h1>Trace explorer</h1>
          <p>Inspect materialized execution graphs without replaying the raw event stream.</p>
        </div>
        <div className="page-header-actions">
          <div className="live-badge"><span /> Read model live</div>
          <button
            className="button secondary"
            onClick={() => tracesQuery.refetch()}
            disabled={tracesQuery.isFetching}
          >
            <Icon name="refresh" className={tracesQuery.isFetching ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard
          icon="activity"
          label="Materialized traces"
          value={formatCompactNumber(result?.totalCount ?? 0)}
          note={`Page ${result?.page ?? page} of ${Math.max(result?.totalPages ?? 1, 1)}`}
          tone="blue"
        />
        <MetricCard
          icon="layers"
          label="Nodes in this page"
          value={formatCompactNumber(totalNodes)}
          note="Bounded summary window"
          tone="violet"
        />
        <MetricCard
          icon="clock"
          label="Currently open"
          value={formatCompactNumber(activeTraces)}
          note={activeTraces ? "Receiving lifecycle events" : "All traces completed"}
          tone="cyan"
        />
        <MetricCard
          icon="shield"
          label="Diagnostics"
          value={formatCompactNumber(issueCount)}
          note={issueCount ? "Review recommended" : "No issues on this page"}
          tone={issueCount ? "amber" : "green"}
        />
      </section>

      <section className="panel trace-table-panel">
        <div className="panel-toolbar">
          <div>
            <h2>Recent traces</h2>
            <p>Ordered by latest materialization time</p>
          </div>
          <div className="toolbar-controls">
            <label className="search-box">
              <Icon name="search" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter this page by trace ID"
              />
            </label>
            <button className="icon-button outlined" aria-label="Filter traces">
              <Icon name="filter" />
            </button>
          </div>
        </div>

        {tracesQuery.isLoading && <TraceTableSkeleton />}

        {tracesQuery.isError && (
          <div className="large-empty-state">
            <div className="empty-icon"><Icon name="terminal" /></div>
            <h3>Could not load traces</h3>
            <p>Check that the Hono server is running and your session is valid.</p>
            <button className="button primary" onClick={() => tracesQuery.refetch()}>
              Try again
            </button>
          </div>
        )}

        {!tracesQuery.isLoading && !tracesQuery.isError && traces.length === 0 && (
          <div className="large-empty-state">
            <div className="empty-icon"><Icon name="graph" /></div>
            <h3>{filter ? "No matching traces" : "No traces materialized yet"}</h3>
            <p>{filter ? "Try a different trace ID." : "Ingest telemetry to populate this workspace."}</p>
          </div>
        )}

        {traces.length > 0 && (
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th>Trace</th>
                  <th>Status</th>
                  <th>Graph size</th>
                  <th>Importance</th>
                  <th>Duration</th>
                  <th>Diagnostics</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => {
                  const diagnostics = diagnosticCount(trace);
                  return (
                    <tr key={trace.traceId}>
                      <td>
                        <Link
                          to="/traces/$traceId"
                          params={{ traceId: trace.traceId }}
                          search={{ threshold: trace.minImportanceLevel, cursor: undefined }}
                          className="trace-name-cell"
                        >
                          <span className="trace-glyph"><Icon name="graph" /></span>
                          <span>
                            <strong title={trace.traceId}>{shortId(trace.traceId, 18)}</strong>
                            <small>Started {formatDate(trace.startedAt)}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={`status-pill ${trace.endedAt === null ? "running" : "complete"}`}>
                          <span />
                          {trace.endedAt === null ? "Running" : "Complete"}
                        </span>
                      </td>
                      <td>
                        <strong>{formatCompactNumber(trace.nodeCount)}</strong>
                        <small>{formatCompactNumber(trace.edgeCount)} edges</small>
                      </td>
                      <td>
                        <div className="importance-stack">
                          <span>I{trace.minImportanceLevel}</span>
                          <i />
                          <span>I{trace.maxImportanceLevel}</span>
                        </div>
                      </td>
                      <td>{formatDuration(trace.startedAt, trace.endedAt)}</td>
                      <td>
                        <span className={`diagnostic-count ${diagnostics ? "has-issues" : ""}`}>
                          {diagnostics}
                        </span>
                      </td>
                      <td>
                        <span title={formatDate(trace.materializedAt)}>
                          {relativeTime(trace.materializedAt)}
                        </span>
                      </td>
                      <td>
                        <Link
                          to="/traces/$traceId"
                          params={{ traceId: trace.traceId }}
                          search={{ threshold: trace.minImportanceLevel, cursor: undefined }}
                          className="row-action"
                          aria-label={`Open trace ${trace.traceId}`}
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
        )}

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
              <Icon name="arrow-left" /> Previous
            </button>
            <span className="page-number">{page}</span>
            <button
              className="pagination-button"
              onClick={() => goToPage(page + 1)}
              disabled={!result?.hasNextPage}
            >
              Next <Icon name="arrow-right" />
            </button>
          </div>
        </footer>
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
    <article className="metric-card">
      <div className={`metric-icon ${props.tone}`}><Icon name={props.icon} /></div>
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
    <div className="table-skeleton">
      {Array.from({ length: 7 }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span /><span /><span /><span /><span />
        </div>
      ))}
    </div>
  );
}

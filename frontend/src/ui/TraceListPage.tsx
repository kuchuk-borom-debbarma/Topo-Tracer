import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { deleteTrace, fetchTraces } from "../api";
import type { TraceListResult } from "../types";
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
const FEATURE_CARDS = [
  {
    label: "Topo Tracer",
    title: "Trace graph explorer for large systems.",
    copy: "Materialized graph windows let you inspect complex traces without loading the entire run.",
    icon: "graph" as const,
  },
  {
    label: "Importance",
    title: "Move from overview to detail.",
    copy: "Thresholds keep noisy spans collapsed until you choose to reveal deeper execution paths.",
    icon: "filter" as const,
  },
  {
    label: "Access",
    title: "Each user sees their own traces.",
    copy: "API keys, trace lists, summaries, and flow reads stay scoped to the logged-in account.",
    icon: "shield" as const,
  },
];

export function TraceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { page?: number };
  const page = search.page ?? 1;
  const [filter, setFilter] = useState("");
  const [featureIndex, setFeatureIndex] = useState(0);
  const tracesQuery = useQuery({
    queryKey: ["traces", page, PAGE_SIZE],
    queryFn: () => fetchTraces({ page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTrace,
    onMutate: async (traceId) => {
      await queryClient.cancelQueries({ queryKey: ["traces"] });
      const previous = queryClient.getQueriesData<TraceListResult>({ queryKey: ["traces"] });
      queryClient.setQueriesData<TraceListResult>({ queryKey: ["traces"] }, (current) => {
        if (!current) return current;
        const traces = current.traces.filter((trace) => trace.traceId !== traceId);
        if (traces.length === current.traces.length) return current;
        return {
          ...current,
          traces,
          totalCount: Math.max(0, current.totalCount - 1),
        };
      });
      return { previous };
    },
    onError: (_error, _traceId, context) => {
      for (const [key, value] of context?.previous ?? []) {
        queryClient.setQueryData(key, value);
      }
      window.alert("Trace deletion failed. Please try again.");
    },
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

  const goToPage = (nextPage: number) => {
    navigate({
      to: "/traces",
      search: { page: nextPage },
    });
  };
  const feature = FEATURE_CARDS[featureIndex] ?? FEATURE_CARDS[0];
  const goToFeature = (direction: -1 | 1) => {
    setFeatureIndex((current) => (current + direction + FEATURE_CARDS.length) % FEATURE_CARDS.length);
  };

  return (
    <main className="page trace-list-page trace-dashboard-page">
      <section className="single-feature-card">
        <button
          type="button"
          className="feature-arrow"
          onClick={() => goToFeature(-1)}
          aria-label="Previous feature"
        >
          <Icon name="arrow-left" />
        </button>
        <div
          className="single-feature-content"
          onTouchStart={(event) => {
            event.currentTarget.dataset.touchStartX = String(event.changedTouches[0]?.clientX ?? 0);
          }}
          onTouchEnd={(event) => {
            const start = Number(event.currentTarget.dataset.touchStartX ?? 0);
            const end = event.changedTouches[0]?.clientX ?? start;
            const delta = end - start;
            if (Math.abs(delta) < 40) return;
            goToFeature(delta > 0 ? -1 : 1);
          }}
        >
          <div className="feature-icon"><Icon name={feature.icon} /></div>
          <div>
            <span>{feature.label}</span>
            <h2>{feature.title}</h2>
            <p>{feature.copy}</p>
          </div>
        </div>
        <button
          type="button"
          className="feature-arrow"
          onClick={() => goToFeature(1)}
          aria-label="Next feature"
        >
          <Icon name="arrow-right" />
        </button>
        <div className="feature-dots" aria-hidden="true">
          {FEATURE_CARDS.map((card, index) => (
            <span key={card.label} className={index === featureIndex ? "active" : ""} />
          ))}
        </div>
      </section>

      <section className="trace-panel trace-dashboard-panel">
        <header className="trace-panel-header trace-dashboard-panel-header">
          <div>
            <h3>Recent traces</h3>
          </div>

          <div className="trace-table-actions">
            <button
              type="button"
              className="button subtle"
              onClick={() => tracesQuery.refetch()}
              disabled={tracesQuery.isFetching}
            >
              <Icon name="refresh" />
              Refresh
            </button>
            <Link to="/settings/api-keys" className="button subtle">
              <Icon name="shield" />
              API keys
            </Link>
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
                    <th aria-label="Trace actions" />
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
                            <div className="trace-name-stack">
                              <strong title={trace.name || trace.traceId}>
                                {trace.name || shortId(trace.traceId, 22)}
                              </strong>
                              <small title={trace.traceId}>
                                {shortId(trace.traceId, 22)} · Started {formatDate(trace.startedAt)}
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
                          <div className="trace-row-actions">
                            <button
                              type="button"
                              className="row-action danger"
                              aria-label={`Delete trace ${trace.name || trace.traceId}`}
                              disabled={deleteMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                const label = trace.name || trace.traceId;
                                if (!window.confirm(`Delete "${label}" permanently?`)) return;
                                deleteMutation.mutate(trace.traceId);
                              }}
                            >
                              <Icon name="trash" />
                            </button>
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
                          </div>
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

function TraceTableSkeleton() {
  return (
    <div className="trace-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="trace-skeleton-row" />
      ))}
    </div>
  );
}

import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { fetchTracesList, queryKeys, type TraceListItem } from "../api/client";

export function TracesListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.tracesList(page, LIMIT),
    queryFn: () => fetchTracesList(page, LIMIT),
  });

  // Client-side filter by traceId or container name
  const filtered = useMemo(() => {
    if (!data?.traces) return [];
    if (!search.trim()) return data.traces;
    const q = search.trim().toLowerCase();
    return data.traces.filter(
      (t) =>
        t.traceId.toLowerCase().includes(q) ||
        t.containerNames.some((n) => n.toLowerCase().includes(q))
    );
  }, [data?.traces, search]);

  const columns = useMemo<ColumnDef<TraceListItem>[]>(
    () => [
      {
        id: "traceId",
        header: "Trace ID",
        cell: ({ row }) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            title={row.original.traceId}
          >
            {row.original.traceId.length > 40
              ? row.original.traceId.slice(0, 40) + "…"
              : row.original.traceId}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.isZoomReady ? (
            <span className="badge badge-ready">✓ Ready</span>
          ) : (
            <span className="badge badge-pending">⏳ Compiling</span>
          ),
      },
      {
        id: "tags",
        header: "Tags",
        cell: ({ row }) => (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(row.original.tags || []).slice(0, 3).map((t) => (
              <span key={t} className="badge badge-depth">
                {t}
              </span>
            ))}
            {(row.original.tags || []).length > 3 && (
              <span className="badge badge-depth">
                +{(row.original.tags || []).length - 3}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "containers",
        header: "Containers",
        cell: ({ row }) => (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {row.original.containerNames.slice(0, 3).map((n) => (
              <span key={n} className="badge badge-type">
                {n}
              </span>
            ))}
            {row.original.containerNames.length > 3 && (
              <span className="badge badge-type">
                +{row.original.containerNames.length - 3}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => {
          const ts = row.original.createdAt;
          if (!ts)
            return <span style={{ color: "var(--text-muted)" }}>—</span>;
          // ClickHouse may return millis or micros
          const ms = ts > 1e12 ? ts / 1000 : ts;
          const d = new Date(ms);
          return (
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              {d.toLocaleString()}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            className="btn btn-primary btn-sm"
            id={`view-trace-${row.original.traceId.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 32)}`}
            onClick={(e) => {
              e.stopPropagation();
              void navigate({
                to: "/trace/$traceId",
                params: { traceId: row.original.traceId },
              });
            }}
          >
            View Flow →
          </button>
        ),
      },
    ],
    [navigate]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? 0,
  });

  const totalPages = data?.totalPages ?? 0;
  const total = data?.total ?? 0;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Distributed Traces</h1>
          <p className="page-subtitle">
            Browse all recorded execution traces. Click any row to explore its
            call flow.
          </p>
        </div>

        <div className="input-wrapper" style={{ width: 300 }}>
          <span className="input-icon">🔍</span>
          <input
            id="traces-search"
            className="input has-icon"
            placeholder="Search trace ID or container…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="loading-overlay">
          <div className="spinner" />
          Loading traces…
        </div>
      ) : isError ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">Failed to load traces</div>
          <div className="empty-state-desc">
            {error instanceof Error ? error.message : "Could not reach the backend."}
            <br />
            Make sure carno.js is running and check your API URL in{" "}
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: "inline-flex" }}
              onClick={() => document.getElementById("settings-btn")?.click()}
            >
              Settings
            </button>
            .
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-title">
            {search ? "No matching traces" : "No traces yet"}
          </div>
          <div className="empty-state-desc">
            {search
              ? "Try a different search term."
              : "Start tracing your application using the Topo-Tracer Node.js SDK."}
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table" id="traces-table">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() =>
                    void navigate({
                      to: "/trace/$traceId",
                      params: { traceId: row.original.traceId },
                    })
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              {total > 0
                ? `Showing ${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} of ${total} traces`
                : "No traces"}
            </div>

            <div className="pagination-controls">
              <button
                className="pagination-btn"
                id="page-first"
                onClick={() => setPage(1)}
                disabled={page === 1}
                title="First page"
              >
                «
              </button>
              <button
                className="pagination-btn"
                id="page-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                title="Previous page"
              >
                ‹
              </button>

              {/* Windowed page buttons */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 || p === totalPages || Math.abs(p - page) <= 2
                )
                .reduce<(number | string)[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1)
                    acc.push(`…${i}`);
                  acc.push(p);
                  return acc;
                }, [])
                .map((p) =>
                  typeof p === "string" ? (
                    <span
                      key={p}
                      style={{ padding: "0 4px", color: "var(--text-muted)" }}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`pagination-btn${p === page ? " active" : ""}`}
                      id={`page-${p}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                className="pagination-btn"
                id="page-next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                title="Next page"
              >
                ›
              </button>
              <button
                className="pagination-btn"
                id="page-last"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

# Milestone v1 Deep-Dive: Read Model Pipeline & Ghost Projection

**Revision:** 2026-06-06
**Status:** Baseline Complete (Phases 1-6)

This document provides a comprehensive, code-level explanation of the Topo-Tracer v1 telemetry pipeline. It is intended for developers who need to refactor, extend, or troubleshoot the system.

---

## 1. High-Level Data Flow

The system follows a **Write Bounded, Read Partial** architecture to handle large traces without overloading the backend or UI.

```mermaid
graph TD
    subgraph Ingestion
        A[LogServiceImpl] -->|Ingest Raw Events| B[(raw_node_events<br/>raw_edge_events)]
        A -->|Publish Event| C[EventBus]
    end

    subgraph Materialization (Async Worker)
        C -->|Subscribe| D[ReadOptimisedAggregator]
        D -->|Coalesce & Delegate| E[TraceReadModelMaterializer]
        E -->|Read State + Raw| F[(read_nodes<br/>read_edges<br/>trace_summaries)]
        E -->|Save Checkpoint| G[(materialization_checkpoints)]
    end

    subgraph Projection (Read Request)
        H[LogServiceImpl] -->|Query Bounded| F
        H -->|Project in memory| I[LogGraphProjector]
        I -->|Return Result| J[Projected Graph]
    end
```

---

## 2. Materialization: The Checkpoint Strategy

**Goal:** Turn a massive stream of raw "Start" and "End" events into a clean "latest state" read model, efficiently.

### 2.1 Component: `TraceReadModelMaterializer.ts`
This class is the brain of the materialization process. It uses a **Read-Merge-Write-Checkpoint** loop.

1.  **Loading Input:**
    - Loads the current **Checkpoint** (authoritative bookmark).
    - Loads the **Latest Read State** (existing nodes/edges for this trace).
    - Loads **Raw Events** that appeared *after* the checkpoint time/id.
2.  **Incremental Folding (The "Stupid Simple" Merge):**
    - The materializer iterates through new events using modular handlers (`handleNodeStart`, `handleEdgeEnd`, etc.).
    - It merges updates into an in-memory Map of nodes and edges.
    - **Versioning:** Every update gets a new `materialized_at_ms`. ClickHouse selects the latest via `argMax(..., materialized_at_ms)`.
3.  **Flow Ordering (`flowOrder.ts`):**
    - Computes a deterministic topological sort of the graph.
    - Uses explicit edges only.
    - **Self-Healing:** If cycles are detected, it falls back to a stable `startedAt/id` order and flags it in diagnostics.
4.  **Save Order (Idempotency):**
    - **Step 1:** Write `read_nodes`, `read_edges`, and `trace_summaries`.
    - **Step 2:** Write `materialization_checkpoints` **ONLY** after Step 1 succeeds.
    - **Result:** If Step 2 fails or the server crashes, the next run sees the *old* checkpoint and re-processes the same events. Since writes are versioned/idempotent, this is safe.

---

## 3. Data Access: Performance-Safe Reads

**Goal:** Ensure we never load 100k nodes for a single trace read request.

### 3.1 Component: `LogReadRepoClickHouse.ts`
The repository enforces hard **Caps** at the SQL level.

-   **Node Cap:** `DEFAULT_PROJECTION_NODE_CAP` (500).
-   **Edge Cap:** `DEFAULT_PROJECTION_EDGE_CAP` (2000).
-   **Pattern:** `LIMIT cap + 1`. The extra "+1" is a probe; if we get 501 rows, the repo returns `capHit: true` so the caller knows the result was truncated.

---

## 4. Ghost Projection: The Core Innovation

**Goal:** Provide a meaningful summary of a trace even when most of it is hidden by a visibility threshold or truncated by caps.

### 4.1 Threshold Logic
A node is "visible" if its `importanceLevel <= threshold`. Everything else is "hidden".

### 4.2 Component: `LogGraphProjector.ts`
This is a pure, side-effect-free class that transforms raw nodes/edges into a projected graph.

#### A. Contiguous Ghost Grouping
The projector scans nodes in **Flow Order**. When it hits a run of hidden nodes, it collapses them into a single **Ghost Node**.
- **Ghost ID:** `ghost:{traceId}:{threshold}:{startFlow}:{endFlow}` (deterministic).
- **Ghost Shape:** Summarizes the hidden subgraph (min/max importance, node counts by type, total hidden edges).

#### B. Edge Snapping
This is the most critical logic for graph integrity.
1.  **Projected Endpoints:** Every hidden node is mapped to its containing Ghost Node.
2.  **Mapping:**
    - Edge from `Visible A` to `Visible B` -> Stays as-is.
    - Edge from `Visible A` to `Hidden C` -> Snaps to `Visible A` to `Ghost X`.
    - Edge from `Hidden C` to `Hidden D` (same ghost) -> Internal to ghost, removed from edge list, increments `hiddenEdgeCount`.
    - Edge from `Hidden C` to `Hidden E` (different ghosts) -> Snaps to `Ghost X` to `Ghost Y`.

#### C. Edge Aggregation
Multiple edges between the same projected endpoints (e.g., three separate child calls from one node to another) are collapsed into one projected edge with an `edgeCount`.

---

## 5. Security & Observability Boundaries

1.  **No Ancestry Leakage:** The Hono server strictly avoids recursive ancestry lookups. If a node isn't in the bounded read set, its ancestors are not loaded.
2.  **Safe Scalar Logging:** We never log raw `data` or arrays of nodes. Logs only contain safe counts, IDs, and status flags.
3.  **No Domain Logic in Infrastructure:** The `DevEventBus` doesn't know about traces; it only knows how to deliver batches to a consumer.

---

## 6. How to extend the system

-   **To add a new Diagnostic:** Add it to `MaterializationDiagnostics` in `TraceReadModelMaterializer`, handle the logic in the merge handlers, and add it to the `trace_summaries` table schema.
-   **To change Graph Structure:** Modify `flowOrder.ts`. Ensure it remains deterministic (startedAt/id fallback).
-   **To implement Windowing (v2):** Add a `windowStart/End` filter to the `loadBoundedProjectionNodes` query in the repository. The `LogGraphProjector` will automatically handle truncation via `omittedEdgeCount`.

---

## 7. Key Files for Quick Ref

| Path | Purpose |
|------|---------|
| `src/services/log/api/types.ts` | Source of truth for DTOs and Contracts. |
| `src/services/log/internal/materialization/TraceReadModelMaterializer.ts` | The core merge/fold logic. |
| `src/services/log/internal/projection/LogGraphProjector.ts` | The ghosting/snapping algorithm. |
| `src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` | SQL queries and cap enforcement. |
| `src/infra/db/clickhouse/schema.ts` | Materialized table definitions. |

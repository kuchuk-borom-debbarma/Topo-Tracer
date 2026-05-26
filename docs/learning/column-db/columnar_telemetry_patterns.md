# Column-Oriented Telemetry Architecture Guide
### *Deep-dive learning notes on ClickHouse telemetry ingestion, update strategies, keyset pagination, and non-joining graph queries.*

---

## 1. Row-Oriented vs. Column-Oriented Databases

When working with traditional applications, we default to row-oriented databases (like PostgreSQL or MySQL). In high-throughput, real-time distributed tracing, this default choice breaks down.

| Attribute | Row-Oriented (OLTP) | Column-Oriented (OLAP / ClickHouse) |
| :--- | :--- | :--- |
| **Storage Layout** | Row after row (all columns for a row are stored together). | Column by column (all values of a single column are stored together). |
| **Disk I/O** | Reading 1 field requires reading the entire row from disk. | Reading 1 field only reads that specific column's file from disk. |
| **Compression** | Poor (different data types packed adjacent to each other). | High (identical data types stored sequentially, highly compressible). |
| **Write Model** | Optimized for individual row inserts/updates. | Optimized for high-throughput append-only batch inserts. |
| **Read Model** | Superb for pointing lookups (fetching a single row by ID). | Superb for scanning millions of rows over a subset of columns. |

### The Telemetry Reality
Distributed tracing generates millions of logs containing many fields (metadata, hostnames, timestamps, IDs). However, the frontend usually only queries a tiny subset of these columns to render a trace (e.g., `trace_id`, `initiatedAtLocal`, `depthIndex`). A column-oriented database like ClickHouse allows us to fetch only those active columns, reducing disk I/O by orders of magnitude.

---

## 2. In-Memory Time Shifting vs. Database Mutations

### The Columnar Bottleneck: Mutations
In ClickHouse, data is stored in immutable files called **parts**.
* When you write data, ClickHouse creates a part.
* Periodically, in the background, ClickHouse merges these parts.
* **Mutations (Updates/Deletes)** are extremely slow and expensive because ClickHouse cannot simply edit a row in place. To update a column, it must rewrite entire storage parts on disk.

### Our Solution: Shifting Timelines In-Memory
If we ingest trace data with historical timestamps and want to shift them to align with a fresh execution baseline, doing an `UPDATE` in the database is an absolute anti-pattern that will crash production throughput.

Instead, we shift timestamps **in-memory before ingestion** in the service layer:
```typescript
override async updateNodeLocalTimes(nodes: NodeInput[], newTime: Date = new Date()): Promise<NodeInput[]> {
  return nodes.map(n => {
    const baseMs = n.initiatedAtLocal.getTime();
    const newBaseMs = newTime.getTime();
    
    // 1. Calculate offsets in-memory relative to the start node
    const offsetProcessed = n.processedAtLocal.getTime() - baseMs;
    const offsetCompleted = n.completedAtLocal 
      ? n.completedAtLocal.getTime() - baseMs 
      : null;

    // 2. Map coordinates relative to the new base time, preserving execution delays
    return {
      ...n,
      initiatedAtLocal: newTime,
      processedAtLocal: new Date(newBaseMs + offsetProcessed),
      completedAtLocal: offsetCompleted !== null 
        ? new Date(newBaseMs + offsetCompleted) 
        : undefined
    };
  });
}
```
> [!TIP]
> **Key Lesson**: Keep your write pipeline **append-only**. Do all data mutations, calculations, and timescale adjustments in-memory in your application layer before sending the batch down to ClickHouse.

---

## 3. Advanced Keyset (Cursor) Pagination

### Why Offset Pagination (`LIMIT 100 OFFSET 100000`) Fails
In a columnar database, to skip `100,000` rows using `OFFSET`, ClickHouse must still load and read the sorted values of those 100,000 rows from disk to count them. As page depth increases, queries become progressively slower.

### The Keyset Pagination Solution
Instead of telling the database how many rows to skip, we filter using a cursor that marks the boundary of the last item fetched.
* `initiatedAtLocal > :cursorTime`

Because ClickHouse stores data sorted on disk by its primary keys (e.g. `ORDER BY (trace_id, initiatedAtLocal)`), the query is practically instant because ClickHouse uses sparse indexes to skip straight to the exact index block containing that timestamp.

### The Millisecond Duplicate Problem & Composite Cursors
Telemetry events often occur in high-concurrency loops where **multiple nodes share the exact same millisecond timestamp**. If we page purely by timestamp:
1. Page 1 returns Node A, B, and C (all at `10:00:00.005`).
2. Page 2 queries `initiatedAtLocal > 10:00:00.005`.
3. Node B and C are skipped entirely because their timestamp is not strictly greater than the cursor.

We solve this using **Composite Cursors** where the unique record `id` acts as a tie-breaker.

* **Forward seeking**:
  ```sql
  AND (initiatedAtLocal > {afterTime} OR (initiatedAtLocal = {afterTime} AND id > {afterId}))
  ```
* **Backward seeking**:
  ```sql
  AND (initiatedAtLocal < {beforeTime} OR (initiatedAtLocal = {beforeTime} AND id < {beforeId}))
  ```

---

## 4. The Unified Reading Style & Strict Graph Coherence

When rendering a distributed tracing graph, splitting Node and Edge queries into separate endpoints creates **dangling edges** (edges pointing to nodes that are on a different page and have not yet loaded).

### Strict Graph Coherence
We enforce strict graph coherence by returning both elements in a **Unified Envelope** (`GET /telemetry/trace/:traceId`) driven by the Node timeline:
1. Fetch a page of **Nodes** chronologically using the composite keyset cursor.
2. If nodes are returned, extract their IDs: `nodeIds = nodes.map(n => n.id)`.
3. Query the `edges` table in ClickHouse returning only the connecting edges:
   ```sql
   SELECT * FROM toco_tracer.edges
   WHERE trace_id = {traceId}
     AND fromNodeId IN {nodeIds}
     AND toNodeId IN {nodeIds}
   ```

### Why is this efficient in a Columnar Database?
1. **No JOINs**: JOINs are a major bottleneck in column databases. By running two consecutive, targeted queries, we bypass JOIN overhead completely.
2. **Double-Pruning**: ClickHouse pre-filters matching data instantly using the sparse index on the primary key `trace_id`.
3. **CPU Cache SIMD Optimization**: The `AND IN` criteria is evaluated in parallel at the CPU level using bitwise vector instructions over column arrays. ClickHouse discards non-matching rows instantly without even opening the column files for columns not referenced in the filter.

---

## Summary Cheatsheet for Columnar Database Telemetry

1. **Batch Your Ingestions**: Never write one row at a time. ClickHouse works best when you buffer and write batches of 1,000 to 10,000 rows.
2. **Order By Correctly**: Define your primary/sorting key carefully. For telemetry, `ORDER BY (trace_id, timestamp, id)` is highly optimal because it clusters trace data physically together on disk.
3. **Avoid Disk Mutations**: Never use `ALTER TABLE UPDATE` for real-time calculations. Treat the database as an immutable ledger and shift timescales in-memory.
4. **Use Composite Keyset Cursors**: Combine `(timestamp, id)` to prevent concurrent telemetry records from being skipped at pagination boundaries.
5. **Stage Graph Elements Together**: Query nodes and edges sequentially using parent-child ID boundaries to guarantee a coherent, zero-dangling-edge visualization for the UI.

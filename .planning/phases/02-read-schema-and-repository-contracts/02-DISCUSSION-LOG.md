# Phase 2: Read Schema And Repository Contracts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 2-Read Schema And Repository Contracts
**Areas discussed:** Checkpoint progress shape, Latest state storage, Diagnostics shape, Repository boundary depth, Schema documentation

---

## Checkpoint Progress Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Exact bookmark | Remember enough detail to resume at the exact next raw event, even when events have the same timestamp. | ✓ |
| Simple time bookmark | Remember only the last processed time. Easier, but riskier if events arrive late or share timestamps. | |
| You decide | Let the agent choose the safest technical option. | |

**User's choice:** Exact bookmark.
**Notes:** The checkpoint contract should not be a simple last-time marker.

---

## Latest State Storage

| Option | Description | Selected |
|--------|-------------|----------|
| History-friendly rows | Write new replacement rows with a `materialized_at_ms` version. This fits ClickHouse well and keeps rebuilds append-friendly. | ✓ |
| Overwrite-style rows | Treat it like one row gets updated in place. Simpler to imagine, but less natural for ClickHouse. | |
| You decide | Let the agent choose the best fit. | |

**User's choice:** History-friendly rows.
**Notes:** Latest read state should be versioned/replacement-oriented rather than conceptually mutable in-place rows.

---

## Diagnostics Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Named columns | Fixed columns like `orphan_edge_count`, `missing_node_start_count`, etc. Easier to query and test. | ✓ |
| Flexible bag | A map/dictionary of diagnostic names to counts. Easier to add new diagnostics later, but looser. | |
| Both | Fixed important columns plus flexible extra counts. | |
| You decide | Let the agent choose. | |

**User's choice:** Named columns.
**Notes:** Trace summary diagnostics should use fixed count fields instead of a loose map.

---

## Repository Boundary Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Only next-phase needs | Define schema/types/repository methods needed for Phase 3 materialization. Keep projection-specific read methods for Phase 4. | ✓ |
| Prepare projection too | Also define future projection-facing repo methods now, even if they will not be implemented yet. | |
| You decide | Let the agent choose. | |

**User's choice:** Only next-phase needs.
**Notes:** Phase 2 should not overreach into projection data-access contracts.

---

## Schema Documentation

| Option | Description | Selected |
|--------|-------------|----------|
| Comment every schema field | Every ClickHouse read-table column gets an explanatory `COMMENT`; table DDL gets nearby comments explaining design intent. | ✓ |
| Minimal comments | Only non-obvious columns get comments. | |
| External docs only | Explain schema design in planning/docs, not in the schema code itself. | |

**User's choice:** Comment every schema field.
**Notes:** The user explicitly requested comments explaining every column and how the read-optimized tables are designed to work.

---

## the agent's Discretion

- Exact field names and table names are left to planner discretion, within the locked behavior above.
- The planner may choose the exact ClickHouse engine and checkpoint field split, provided it preserves exact resume semantics.

## Deferred Ideas

- Projection-facing repository methods belong to Phase 4.
- Materialization behavior belongs to Phase 3.
- Ghost projection belongs to Phase 5.
- HTTP read routes remain outside v1.

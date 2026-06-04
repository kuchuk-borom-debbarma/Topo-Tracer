# Phase 3 Technical Documentation: Checkpointed Materialization

This document explains the technical implementation of the checkpointed materialization pipeline introduced in Phase 3.

## Overview

The materialization pipeline transforms raw lifecycle events into read-optimized models (nodes, edges, and summaries) using a checkpointed worker. This ensures that even for large traces, we only process new events since the last materialization, while maintaining a consistent and deterministic read view.

## Repository Inputs

The materialization logic depends on the `ILogReadRepo` contract, implemented by `LogReadRepoClickHouse.ts`. It provides three primary input streams:

1.  **Checkpoints**: `loadCheckpoint({ userId, traceId })` retrieves the last successful materialization bookmark.
2.  **Latest Read Model**: `loadLatestReadModel({ userId, traceId })` loads the current state of nodes and edges using `argMax` to select the latest version of each record.
3.  **Raw Events**: `loadRawEventsAfterCheckpoint({ userId, traceId, checkpoint })` fetches events from `raw_node_events` and `raw_edge_events` that occurred after the checkpoint.

## Checkpoint Loading

Checkpoints are stored in the `materialization_checkpoints` table. A checkpoint consists of:
- `last_node_event_time`, `last_node_event_id`, `last_node_event_type`
- `last_edge_event_time`, `last_edge_event_id`, `last_edge_event_type`

These fields form a tuple that allows deterministic resume. If no checkpoint exists, the pipeline starts from the beginning of time.

## Raw Event Ordering

Events are loaded and processed in a specific order to ensure deterministic folding:
- **Query Ordering**: `loadRawEventsAfterCheckpoint` orders events by `(event_time, event_id, event_type)`.
- **D-04 Caveat**: While this tuple provides deterministic ordering for resume, the ClickHouse sort key for raw tables is not currently optimized for large trace-local lifecycle sorting. This may be addressed in a future performance phase if ingestion volume warrants it.

## Incremental Merge

The `TraceReadModelMaterializer.ts` performs an in-memory merge of raw events into the existing read model:
1.  **Nodes**: `START` events create or update node records (preserving existing `endedAt` if already present). `END` events update `endedAt` and messages.
2.  **Edges**: `START` events create or update edge records. `END` events update `endedAt`.
3.  **Versioning**: Every updated record receives a new `materialized_at_ms` timestamp, which ClickHouse uses in `argMax` queries to identify the latest version.

## Flow Order

Topological ordering is computed in `flowOrder.ts` using an explicit-edge algorithm:
1.  **Siblings**: Ordered by `startedAt`, then `id`.
2.  **Disconnected Nodes**: Appended after the main tree, ordered by `startedAt`.
3.  **Cycles**: If a cycle is detected, the algorithm falls back to `startedAt/id` order for the affected nodes and increments `diagCycles`.
4.  **Flow Direction**: `fromFlowOrder` and `toFlowOrder` are persisted on every edge to facilitate graph rendering without expensive server-side traversals.

## Diagnostics

Materialization tracks quality metrics to help identify instrumentation issues:
- `diagMissingStarts`: END event seen with no corresponding START.
- `diagMissingEnds`: START event seen but trace is inactive or END missing.
- `diagNegativeDurations`: END timestamp is before START timestamp.
- `diagClockSkew`: Successive events for the same ID have regressing timestamps.
- `diagCycles`: Circular dependencies in the trace graph.
- `diagOrphanEdges`: Edges referencing non-existent nodes.
- `diagInvalidImportance`: Non-finite or missing importance levels.

## Write Ordering And Retry

To maintain consistency, the pipeline follows a strict "checkpoint-last" write order:
1.  **Save Read Model**: `saveReadModel` writes nodes, edges, and the trace summary in a single batch (or logical group).
2.  **Save Checkpoint**: `saveCheckpoint` is called ONLY after the read model is successfully persisted.
3.  **Retry**: If `saveCheckpoint` fails, the materializer retries the write. If it still fails, the next worker run will re-process the same raw events (idempotent write) because the checkpoint wasn't advanced.

## Worker Delegation

`ReadOptimisedAggregator.ts` serves as an event-bus adapter:
- **Coalescing**: Multiple `log.trace.ingested` events for the same trace in one batch are coalesced into a single materialization call.
- **Delegation**: The worker does NOT contain ClickHouse logic or repository calls. It delegates all work to `TraceReadModelMaterializer`.
- **Validation**: Unknown event payloads are validated for `userId` and `traceId` before delegation.

## Security Boundaries

Phase 3 maintains strict boundaries:
- **no HTTP routes**: Materialization is triggered via the internal event bus, not HTTP.
- **no bounded projection reads**: Materialization always loads the full latest state of the trace.
- **no ghost projection**: Logic for specialized views (projections) or synthetic nodes (ghosts) was not implemented.
- **no carno.js, frontend, or SDK changes**: No changes were made to `carno.js`, the frontend, or the SDK.

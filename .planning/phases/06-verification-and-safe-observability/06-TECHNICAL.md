# Phase 6 Technical Closeout

## Duplicate Delivery Contract

Duplicate `log.trace.ingested` delivery is tolerated at the worker/materializer
boundary. The worker coalesces duplicate trace ids inside one batch, and the
materializer reads from the saved per-trace checkpoint before writing latest
read state. Replaying the same trace after a successful materialization leaves
the latest node state, edge state, summary, and checkpoint equivalent.

This contract is verified by
`ReadOptimisedAggregator.test.ts` with a stateful fake read repository and the
real `TraceReadModelMaterializer`.

## Event Bus Ordering Boundary

Trace-local event ordering is the responsibility of the event bus or production
broker. The materializer does not repair broker ordering, sort a broken
trace-local delivery stream into a new semantic order, or infer graph structure
from event arrival.

`DevEventBus` is local and non-durable. It is useful for development and tests,
but it is not the production durability or ordering guarantee. The gap is kept
visible as an operational boundary, not hidden inside materialization.

## Checkpoint Boundary

The per-trace checkpoint is authoritative for incremental materialization.
Rows older than or equal to the saved checkpoint are behind the progress
boundary and are ignored by normal incremental runs.

Behind-checkpoint late rows are therefore deterministic no-ops for incremental
materialization. Correctness for those rows requires an explicit rebuild or a
future repair workflow, not implicit rediscovery from latest read state.

## Diagnose-And-Continue Timing Policy

After-checkpoint lifecycle timing anomalies are diagnostic, not trace-wide
failures. The materializer merges what it can, persists deterministic read
state, and increments summary diagnostics such as negative duration, missing
lifecycle, cycle, orphan edge, invalid importance, or clock-skew counts.

The Phase 6 materializer tests prove an after-checkpoint negative-duration node
increments `diagNegativeDurations` without throwing or blocking checkpoint
progress.

## Safe Observability Contract

Materializer and projection logs use safe scalar summaries. Allowed log fields
include ids, node counts, edge counts, raw event counts, selected threshold,
read caps, cap-hit status, durations, and explicit diagnostic counts.

Raw node arrays, raw edge arrays, raw event arrays, full row objects, request
bodies, full trace summary objects, arbitrary `data` blobs, and arbitrary
metadata objects are forbidden in logs.

The materializer now logs `Materialized trace` with scalar fields only. The
projection service log guard similarly prevents raw payload keys from returning
to graph projection logs.

## SAFE-07 Projection Audit

SAFE-07 is covered by the existing `LogGraphProjector.test.ts` fixture suite.
No duplicate projector tests were added in Phase 6 because every required
matrix item already maps to an existing focused test.

| Matrix Item | Existing Coverage |
|-------------|-------------------|
| visible-hidden-visible | `visible-hidden-visible snapping: snaps edges through ghosts` |
| hidden prefix | `hidden prefix: groups hidden nodes at the start into a ghost` |
| hidden suffix | `hidden suffix: groups hidden nodes at the end into a ghost` |
| all-hidden | `all-hidden: returns one ghost when all nodes are hidden` |
| dense hidden edges | `same-ghost hidden edge count: increments ghost hiddenEdgeCount and omits self-loop`; `duplicate snapped edge aggregation: aggregates by from, to, and type` |
| orphan edges | `orphan edge omission: increments metadata.omittedEdgeCount` |

## Verification Commands

- `cd hono-server && bun test src/services/log/internal/worker/ReadOptimisedAggregator.test.ts src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts`
- `cd hono-server && bun test src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts src/services/log/internal/service-impl/LogServiceImpl.test.ts`
- `cd hono-server && bun test src/services/log/internal/projection/LogGraphProjector.test.ts`
- `cd hono-server && bun test`
- `cd hono-server && bun run fallow`

## Scope Locks

Phase 6 did not add HTTP telemetry routes, frontend behavior, SDK behavior,
`carno.js` behavior, durable production broker implementation, graph-model
changes, stored ghost-node tables, pagination, or windowing.

Edges remain the only graph links. Hono log source must not introduce ancestry
paths, parent paths, inferred parentage, or start-order-derived structure.

Ghost nodes remain an internal runtime projection component returned with CAP
metadata for the partial graph response. They are not stored as durable read
tables.

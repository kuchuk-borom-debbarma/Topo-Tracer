# Phase 5: Ghost Projection Logic - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-05T15:47:26Z
**Phase:** 5-Ghost Projection Logic
**Areas discussed:** Hidden Context Budget, Ghost Shape, Edge Snapping

---

## Hidden Context Budget

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded aggregate queries | Add repository methods that aggregate hidden nodes/edges by flow-order ranges in ClickHouse. | |
| Visible-edge only | Use only visible nodes and visible-touching edges from Phase 4. | |
| Small-trace full fixture only | Allow full latest-state reads only in explicit tiny fixtures. | |
| Runtime in-memory calculation | Compute ghosts at read time from loaded projection inputs. | yes |

**User's choice:** Runtime in-memory calculation for v1.
**Notes:** The user reasoned that calculating ghost nodes at runtime is simple
enough for the first version. We clarified that this still needs bounded inputs
to preserve the large-trace safety goal.

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded in-memory projection | Load only capped projection inputs and report cap hits. | yes |
| Full trace in memory for v1 | Load the full trace for the simplest algorithm. | |
| Hybrid small-trace fallback | Full trace only below a small summary-based limit. | |

**User's choice:** Bounded in-memory projection.
**Notes:** If caps are hit, the user chose returning a partial graph with cap
metadata rather than failing or hiding ghosts.

| Option | Description | Selected |
|--------|-------------|----------|
| Internal projection component | Keep projection pure/testable under log service internals. | yes |
| Inside repository implementation | Fetch and project in one persistence implementation. | |
| Inside log service implementation | Put projection directly in service orchestration. | |

**User's choice:** Internal projection component.
**Notes:** The component should stay out of ClickHouse repository code and route
handlers.

---

## Ghost Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Range-based deterministic IDs | Include trace id, threshold, and hidden flow-order range. | yes |
| Sequence IDs | Use short IDs such as `ghost:1`, `ghost:2`. | |
| Opaque generated IDs | Use random or UUID-like generated ids. | |

**User's choice:** Range-based deterministic IDs.
**Notes:** This supports stable tests and future UI caching.

| Option | Description | Selected |
|--------|-------------|----------|
| Contiguous hidden flow-order runs | One ghost per consecutive hidden range. | yes |
| One ghost per visible gap | Define ghosts by surrounding visible nodes. | |
| One ghost for all hidden nodes | Collapse all hidden nodes into one ghost. | |

**User's choice:** Contiguous hidden flow-order runs.
**Notes:** Prefixes, suffixes, middle gaps, and all-hidden input use the same
range rule.

| Option | Description | Selected |
|--------|-------------|----------|
| Full required summary | Include hidden counts, type counts, importance/time/range fields. | yes |
| Minimal summary | Include only hidden node count and flow-order range. | |
| Count and time only | Include counts, time range, and range fields. | |

**User's choice:** Full required summary.
**Notes:** All-hidden traces should return one deterministic all-hidden ghost.

---

## Edge Snapping

| Option | Description | Selected |
|--------|-------------|----------|
| Keep direct visible edges | Preserve visible-to-visible edges as direct projected edges. | yes |
| Always route through ghosts | Route through ghosts if hidden nodes exist between visible endpoints. | |
| Aggregate all visible-to-visible edges by type only | Collapse direct visible edges by type. | |

**User's choice:** Keep direct visible edges.
**Notes:** This matches the Phase 5 success criteria and avoids distorting real
direct relationships.

| Option | Description | Selected |
|--------|-------------|----------|
| Snap to the hidden node's ghost | Replace hidden endpoints with their ghost range id. | yes |
| Drop hidden-touching edges | Omit edges touching hidden nodes. | |
| Keep original hidden endpoint IDs in metadata only | Preserve hidden ids only as debug metadata. | |

**User's choice:** Snap to the hidden node's ghost.
**Notes:** Hidden-to-hidden edges inside one ghost become summary counts, while
cross-ghost hidden edges become ghost-to-ghost projected edges.

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate into one projected edge with count | Group by snapped source, target, and edge type. | yes |
| Return every snapped edge individually | Keep every snapped edge. | |
| Keep first edge only | Drop duplicate snapped edges after the first. | |

**User's choice:** Aggregate into one projected edge with count.
**Notes:** Orphan or malformed edges should be omitted from projected edges and
counted in diagnostics/metadata instead of inventing endpoints.

## the agent's Discretion

- Choose exact internal component names and type names.
- Choose whether projection DTOs live in public `api/types.ts` or internal
  projection types, as long as boundaries stay clean.
- Choose exact projected edge count field name.

## Deferred Ideas

None.

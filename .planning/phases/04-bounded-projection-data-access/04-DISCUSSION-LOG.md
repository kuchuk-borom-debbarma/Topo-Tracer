# Phase 4: Bounded Projection Data Access - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 4-Bounded Projection Data Access
**Areas discussed:** Cap behavior, Cap source, Repository boundary, Edge read strategy, Cap detection, Full-trace fixture exception

---

## Cap Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded + flag | Return max safe rows and metadata saying cap hit; Phase 5 can show incomplete projection safely. | yes |
| Typed error | Stop projection when cap exceeded; simpler safety but UI/service gets no partial graph. | |
| You decide | Let planner choose safest contract from code shape and tests. | |

**User's choice:** Bounded + flag.
**Notes:** Repository should return safe bounded rows with explicit cap metadata,
not fail only because more rows exist.

---

## Cap Source

| Option | Description | Selected |
|--------|-------------|----------|
| Repo constants | Hardcoded defaults in repo/types for v1; easiest, safe, no env drift. | yes |
| Env config | Runtime-tunable caps via Hono env helpers; more flexible, more surface. | |
| Caller params with max clamp | Service/projection passes requested caps, repo clamps to absolute max. | |

**User's choice:** Repo constants.
**Notes:** v1 should avoid environment configuration for projection caps.

---

## Repository Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Add methods to `ILogReadRepo` | Same read-model repo owns latest-state and bounded projection reads; less wiring. | yes |
| Create `ILogProjectionRepo` | Cleaner separation, but more factory/wiring now. | |
| You decide | Planner chooses. | |

**User's choice:** Add methods to `ILogReadRepo`.
**Notes:** Existing read repository contract should grow bounded projection
methods for Phase 4.

---

## Edge Read Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Visible-node edge reads | Repository reads bounded edges where endpoints are in or near visible set; Phase 5 builds snapping on top. | yes |
| Flow-order span reads | Repository reads bounded edges crossing bounded flow-order ranges; more ready for ghosts, more complex. | |
| Both minimal surfaces | Add separate visible-edge and span-edge reads now. | |

**User's choice:** Visible-node edge reads.
**Notes:** Keep Phase 4 focused on bounded data access. Phase 5 owns snapping
and ghost aggregation.

---

## Cap Detection

| Option | Description | Selected |
|--------|-------------|----------|
| `LIMIT cap + 1` probe | Query one extra row, return first cap rows, set capHit if extra row exists. | yes |
| `COUNT` preflight | Run count first, then bounded query; precise, extra query. | |
| Trust returned length | Set capHit only when rows length equals cap; cheaper but ambiguous. | |

**User's choice:** `LIMIT cap + 1` probe.
**Notes:** Use query-level proof of overflow without running a full count.

---

## Full-Trace Fixture Exception

| Option | Description | Selected |
|--------|-------------|----------|
| Tests only | Production bounded methods only; tests may use tiny full-trace data for setup. | yes |
| Allow small traces | Production can load whole trace if summary says trace is tiny. | |
| Never anywhere | Even tests avoid full-trace helpers. | |

**User's choice:** Tests only.
**Notes:** User asked for clarification, then selected tests-only. Production
projection code must never load all nodes or edges for a trace.

---

## the agent's Discretion

- Exact method and type names for bounded projection reads.
- Exact conservative v1 cap constant values.
- Exact placement of projection-facing non-row types.
- Exact fake-client assertion style for proving scope and cap behavior.

## Deferred Ideas

- Ghost projection logic.
- HTTP read routes.
- Runtime-tunable cap configuration.

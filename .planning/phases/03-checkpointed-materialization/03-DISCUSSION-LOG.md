# Phase 3: Checkpointed Materialization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 3-Checkpointed Materialization
**Areas discussed:** Late Event Policy, Flow Order Rules, Malformed Graph Diagnostics, Retry And Partial Write Semantics, Technical Documentation

---

## Late Event Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic source-order only | Treat checkpoint as the source-progress boundary and merge timing anomalies as diagnostics. | |
| Broker preserves trace-local order | Rely on the message broker/event bus to maintain ordering, and keep materialization focused on checkpointed resume. | ✓ |
| Rediscover older rows behind checkpoint | Scan behind checkpoints to recover late-inserted older raw rows. This increases complexity and weakens checkpoint semantics. | |

**User's choice:** Broker preserves trace-local order.
**Notes:** The user said late-event ordering should be the responsibility of the message broker. The agent noted that the planner should still verify whether existing raw ordering fields are sufficient for deterministic resume.

---

## Flow Order Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Pure timestamp order | Sort nodes only by lifecycle timing and stable ids. Simple, but weaker for graph continuity. | |
| Edge-aware deterministic order | Use explicit edges for topological ordering, with `startedAt` then id as stable tie breakers for branches and disconnected nodes. | ✓ |
| Agent discretion | Let the planner choose the exact algorithm while preserving explicit-edge-only graph semantics. | ✓ |

**User's choice:** User asked the agent to decide or suggest. The locked recommendation is edge-aware deterministic order.
**Notes:** For a node with two children, child nodes become siblings in a stable linear order, sorted by `startedAt` then node id. `flowOrder` is not depth or tree parentage.

---

## Malformed Graph Diagnostics

| Option | Description | Selected |
|--------|-------------|----------|
| Strict fail | Stop materialization on malformed graph data. Clean but one bad edge can block a whole trace. | |
| Diagnose and continue | Materialize valid state, omit or degrade invalid pieces, and increment named diagnostics. | ✓ |
| Quarantine trace | Write summary diagnostics only and skip latest rows for severe corruption. More operational work than v1 needs. | |

**User's choice:** Diagnose and continue.
**Notes:** This fits the trace-inspection goal and preserves observability for imperfect telemetry.

---

## Retry And Partial Write Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent rewrite, checkpoint last | Save read rows and summary first, then checkpoint. Retry rewrites replacement rows if checkpoint saving fails. | ✓ |
| Checkpoint first | Advance progress before read rows exist. Rejected as unsafe. | |
| Transaction-like staging | Add stronger staging/commit behavior. Likely overbuilt for v1 ClickHouse materialization. | |

**User's choice:** Idempotent rewrite, checkpoint last.
**Notes:** The user agreed this is the best approach. It matches ClickHouse append-heavy replacement rows.

---

## Technical Documentation

| Option | Description | Selected |
|--------|-------------|----------|
| Phase technical docs | Add documentation for each phase explaining technical behavior and how the system works. | ✓ |
| Minimal summaries only | Rely on plan summaries and code comments. Insufficient for the user's stated need. | |

**User's choice:** Add technical documentation for every phase.
**Notes:** The user said documentation is important because they need to know how the whole system works. Phase 3 should document materialization mechanics concretely.

---

## the agent's Discretion

- Exact materialization component name and file split.
- Exact deterministic topological-sort implementation.
- Exact repository contract adjustment needed to read raw events after checkpoints.
- Exact documentation file names and placement.

## Deferred Ideas

- Durable production broker ordering and retry infrastructure beyond the current development event bus.
- Bounded projection reads.
- Ghost projection logic.
- HTTP read routes.

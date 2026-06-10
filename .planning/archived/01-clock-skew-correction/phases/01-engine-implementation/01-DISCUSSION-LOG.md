# Phase 1: Engine Implementation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 1-Engine Implementation
**Areas discussed:** Multiple Parents, Cycle Handling, Correction Propagation, Integration Point

---

## Multiple Parents

| Option | Description | Selected |
|--------|-------------|----------|
| Latest Parent (Strict) | The child must start after ALL parents. Use the latest parent's startedAt + 1ms. | |
| Earliest Parent (Permissive) | The child must start after at least ONE parent. Use the earliest parent's startedAt + 1ms. | ✓ |

**User's choice:** Earliest Parent (Permissive). Note: "we should not face the situation where one node has multiple parents... but for the sake let's take the earliest parent".

---

## Cycle Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Correct Cycle Nodes | Apply correction even to forced orders in cycles. It might lead to weird times but preserves the 'flow' visual. | ✓ |
| Skip Cycle Nodes | If a node is part of a detected cycle, skip clock-skew correction for it. | |

**User's choice:** Correct Cycle Nodes. Note: "we should not have cycles as it's a flow but in case it does do the correct cycle nodes".

---

## Correction Propagation

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy Shift (Causality Only) | Only shift a child if it now violates causality. | ✓ |
| Aggressive Shift (Preserve Spacing) | Shift ALL downstream children by the same delta to preserve relative spacing. | |

**User's choice:** Lazy Shift (Causality Only).

---

## Integration Point

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Method | Add a dedicated 'correctClockSkew' method called after 'applyFlowOrder'. | ✓ |
| Inlined in Fold | Incorporate the correction logic directly into 'applyFlowOrder'. | |

**User's choice:** Dedicated Method.

---

## Claude's Discretion

- Claude will decide on the exact internal implementation of the parent-child adjacency lookup map used for correction.

## Deferred Ideas

- None.

# Phase 2: Service-Level Projection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 2-Service-Level Projection
**Areas discussed:** Backward navigation, Window Bounds, Threshold vs Cursor, Code organization

---

## Backward navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Simple Offset Subtraction | Calculate as offset - limit. If result < 0, use 0. Simple and predictable. | ✓ |
| Client-side Tracking | The backend doesn't provide it; the frontend is responsible for tracking its own history. | |

**User's choice:** Simple Offset Subtraction

---

## Window Bounds

| Option | Description | Selected |
|--------|-------------|----------|
| Actual Node Bounds | Use the flowOrder of the first and last nodes actually returned in the window. | ✓ |
| Requested Bounds | Use the requested offset and offset + limit. | |

**User's choice:** Actual Node Bounds

| Option | Description | Selected |
|--------|-------------|----------|
| Null/Zero Bounds | Set both bounds to 0 or null. Clear signal that nothing is there. | ✓ |
| Reflect Offset | Keep fromFlowOrder as the requested offset, and toFlowOrder as offset. | |

**User's choice:** Null/Zero Bounds

---

## Threshold vs Cursor

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve Position | Preserve the current offset. The user stays at their topological position, even if the view becomes sparse. | ✓ |
| Reset to Start | Reset the cursor to the start of the trace (offset 0) whenever the threshold changes. | |

**User's choice:** Preserve Position

---

## Code organization

| Option | Description | Selected |
|--------|-------------|----------|
| LogServiceImpl | Assemble paging metadata in LogServiceImpl. Keeps the projector focused purely on graph transformation. | ✓ |
| LogGraphProjector | Extend LogGraphProjector to accept paging info and return the fully populated metadata. | |

**User's choice:** LogServiceImpl

---

## Deferred Ideas

- Bi-directional paging and complex boundary ghosting remain deferred as decided in Phase 1.

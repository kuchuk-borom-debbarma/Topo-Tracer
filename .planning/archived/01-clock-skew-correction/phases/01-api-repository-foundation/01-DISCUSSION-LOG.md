# Phase 1: API & Repository Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 1-API & Repository Foundation
**Areas discussed:** Cursor representation, Paging Metadata Shape, Repository Interface, Boundary Logic

---

## Cursor representation

| Option | Description | Selected |
|--------|-------------|----------|
| Raw Integer | Expose flowOrder as a raw number. Simple to debug. | |
| Opaque String (B64) | Base64 encode the integer (e.g. "MTI="). Prevents client-side manipulation. | ✓ |

**User's choice:** Opaque String (B64)

| Option | Description | Selected |
|--------|-------------|----------|
| Null/Optional | Omitting the cursor field defaults to flowOrder 0. Standard REST pattern. | ✓ |
| Explicit Start | An explicit B64 encoded 0 or a keyword like "FIRST". Explicit. | |

**User's choice:** Null/Optional

| Option | Description | Selected |
|--------|-------------|----------|
| Versioned Cursor | Include the materialization timestamp in the cursor to detect if the trace was updated mid-paging. | ✓ |
| Simple Offset | Just the offset. Faster, but might show inconsistent data if materialization runs during paging. | |

**User's choice:** Versioned Cursor

| Option | Description | Selected |
|--------|-------------|----------|
| Conflict Error | Return a 409 error. Frontend can then prompt the user to refresh the trace view. | ✓ |
| Best Effort (Latest) | Ignore the stale timestamp and return data at the requested offset from the latest model. | |

**User's choice:** Conflict Error

---

## Paging Metadata Shape

| Option | Description | Selected |
|--------|-------------|----------|
| metadata.paging | Add a 'paging' object to the existing 'metadata' field. (Clean nesting). | ✓ |
| Flat metadata | Add 'hasBefore', 'nextCursor', etc. directly to the 'metadata' field. (Flatter). | |

**User's choice:** metadata.paging

| Option | Description | Selected |
|--------|-------------|----------|
| Include Total Count | Always include 'totalNodeCount' for the trace in the paging metadata. Helpful for UI progress bars. | ✓ |
| Omit Total Count | Omit total count. Paging is relative; absolute size doesn't matter for exploration. | |

**User's choice:** Include Total Count

| Option | Description | Selected |
|--------|-------------|----------|
| Descriptive (nextCursor) | Standard descriptive keys like 'nextCursor' and 'previousCursor'. | ✓ |
| Compact (next) | Short keys like 'next' and 'prev'. Conserves a few bytes. | |

**User's choice:** Descriptive (nextCursor)

| Option | Description | Selected |
|--------|-------------|----------|
| Include Bounds | Include 'fromFlowOrder' and 'toFlowOrder' in the metadata to describe the current window's range. | ✓ |
| Omit Bounds | Omit. The client already has the node data to derive this if needed. | |

**User's choice:** Include Bounds

---

## Repository Interface

| Option | Description | Selected |
|--------|-------------|----------|
| PagingParams Object | Create a 'PagingParams' interface { offset: number; limit: number } and pass it to methods. Scalable. | ✓ |
| Individual Fields | Add 'offset' and 'limit' as separate optional fields to existing param objects. Simpler for small changes. | |

**User's choice:** PagingParams Object

| Option | Description | Selected |
|--------|-------------|----------|
| PagedResult Wrapper | Return a wrapper like { nodes: T[]; hasMore: boolean } to avoid re-calculating metadata in the service. | ✓ |
| Raw Array + Probe | Keep returning the raw array (plus the +1 probe node) and let the service handle the metadata logic. | |

**User's choice:** PagedResult Wrapper

| Option | Description | Selected |
|--------|-------------|----------|
| Update Existing | Keep 'loadBoundedProjectionNodes' but add PagingParams. Maintains consistency. | ✓ |
| Rename for Clarity | Rename to 'loadWindowedProjectionNodes' to better reflect the new behavior. Clearer intent. | |

**User's choice:** Update Existing

| Option | Description | Selected |
|--------|-------------|----------|
| Add Paging to Both | Update 'loadBoundedVisibleNodes' (importance-filtered) to also support windowing. Essential for FR3. | ✓ |
| Unfiltered Only | Only add paging to the unfiltered 'ProjectionNodes' method for now. Slower rollout. | |

**User's choice:** Add Paging to Both

---

## Boundary Logic

| Option | Description | Selected |
|--------|-------------|----------|
| Empty Result (Graceful) | Return an empty nodes array with 'hasAfter: false'. Graceful. | ✓ |
| Error (400) Barbarian | Return a 400 Bad Request if the offset is beyond the trace's node count. Strict. | |

**User's choice:** Empty Result (Graceful)

| Option | Description | Selected |
|--------|-------------|----------|
| Silent Cap (1000) | If a client requests a limit of 5,000, silently cap it to 1,000 (per config.json). Protects performance. | ✓ |
| Explicit Limit Error | Return a 400 error if the requested limit exceeds the hard cap. Explicit. | |

**User's choice:** Silent Cap (1000)

| Option | Description | Selected |
|--------|-------------|----------|
| Reject (400) | Return a 400 Bad Request. Invalid input should be rejected. | ✓ |
| Default to Start | Default to flowOrder 0 (start of trace). Resilient but might be confusing. | |

**User's choice:** Reject (400)

---

## Claude's Discretion

- Claude will decide on the exact internal serialization format of the opaque cursor (e.g. JSON vs. Pipe-separated string inside Base64).

## Deferred Ideas

- Bi-directional paging and complex ghosting at boundaries.

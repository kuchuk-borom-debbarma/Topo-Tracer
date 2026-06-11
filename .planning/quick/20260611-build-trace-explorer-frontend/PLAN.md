---
status: complete
created: 2026-06-11
---

# Build Trace Explorer Frontend

Create a professional Vite/React frontend in `frontend` that uses TanStack
Router, TanStack Query, and React Flow to browse the Hono server's materialized
trace read models.

## Tasks

1. Add a bounded, paginated trace-list contract to the Hono log service and
   expose it through `GET /api/v1/traces`.
2. Add route-level tests and repository/service tests for trace pagination.
3. Rebuild `frontend` around authenticated routes, a paginated trace index, and
   a trace flow workspace with importance filtering, cursor paging, diagnostics,
   and node/edge inspection.
4. Run backend tests and frontend type/build checks.
5. Verify responsive layout and core interactions in the in-app browser.

## Guardrails

- Keep backend changes inside `hono-server`.
- Preserve explicit-edge graph semantics.
- Enforce hard API caps and tenant-scoped reads.
- Use the existing Hono service/repository boundaries.

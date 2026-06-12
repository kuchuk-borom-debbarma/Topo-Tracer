---
status: complete
completed: 2026-06-13
---

Redesigned the trace flow detail view to make the graph canvas the primary surface.

Changes:
- Replaced the dark/cluttered graph workspace with a light production-style flow canvas.
- Compact metrics and threshold controls so the graph appears in the first viewport.
- Restyled graph nodes, edges, controls, pagination, and selection states for clearer scanning.
- Hid edge labels unless selected to reduce visual noise.
- Tightened React Flow fit and graph layout so visible nodes are larger and better centered.
- Fixed the app shell route title by using router location instead of stale `window.location.pathname`.

Verification:
- `rtk npm run build` in `frontend`
- Visual check in Zen at `http://localhost:5173/traces/55fd4402-b07d-4a49-b97f-2c8bb779fbf1?threshold=0`

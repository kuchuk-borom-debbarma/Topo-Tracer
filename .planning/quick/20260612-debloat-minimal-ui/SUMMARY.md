---
status: complete
---

# Debloat Minimal UI

Made trace list and trace detail views substantially less bulky.

## Completed

- Collapsed sidebar to an icon-first rail.
- Hid dashboard metric-card band from trace list.
- Compacted trace table rows and removed redundant columns.
- Removed unused filter button.
- Hid trace detail recent-trace rail.
- Made graph canvas full-width.
- Removed idle trace-summary inspector; inspector appears only after selecting a node or edge.
- Simplified graph toolbar and graph node cards.

## Verification

- `npm run build` in `frontend` passed.
- `git diff --check` passed.
- `/traces?page=1` and `/traces/:traceId?threshold=0` returned `200 OK` from Vite.

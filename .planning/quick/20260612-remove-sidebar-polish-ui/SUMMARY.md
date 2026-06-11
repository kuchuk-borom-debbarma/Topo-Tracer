---
status: complete
---

# Remove Sidebar And Polish UI

Removed the sidebar and restyled the app toward the provided Headroom-style reference.

## Completed

- Replaced `AppShell` with a full-width content shell.
- Removed visible sidebar/nav chrome.
- Applied dark radial background, subtle grid texture, green accent, large title type, and glass panels.
- Converted trace list/table, graph canvas, toolbar, node cards, pagination, and auth surfaces to the dark minimal theme.
- Reduced graph detail chrome to a compact floating threshold control.

## Verification

- `npm run build` in `frontend` passed.
- `git diff --check` passed.
- `/traces?page=1` and `/traces/:traceId?threshold=0` returned `200 OK` from Vite.

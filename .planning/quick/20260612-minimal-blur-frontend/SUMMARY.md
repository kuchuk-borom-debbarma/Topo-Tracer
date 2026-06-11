---
status: complete
---

# Minimal Blur Frontend Theme

Applied a quieter glass/blur visual layer and removed noisy interface copy.

## Completed

- Added minimal blur theme overrides with translucent panels, muted borders, and one restrained accent.
- Reduced sidebar, trace list, metric card, login, and graph helper text.
- Removed unused trace-list filter button.
- Kept core controls: navigation, search, refresh, pagination, graph threshold, auth flow.

## Verification

- `npm run build` in `frontend` passed.
- `git diff --check` passed.
- `GET http://127.0.0.1:5173/traces?page=1` returned `200 OK`.

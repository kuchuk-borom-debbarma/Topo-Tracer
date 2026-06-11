---
status: complete
---

# Clean Inspector And Badge

Removed redundant inspector heading and fixed unreadable importance badges.

## Completed

- Removed visible `Selection` heading.
- Kept close button only.
- Increased importance badge contrast on normal and ghost cards.
- Removed wasted inspector header divider/spacing.

## Verification

- `npm run build` in `frontend` passed.
- `git diff --check` passed.
- Detail route returned `200 OK` from Vite.

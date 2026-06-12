# Quick Task 260612-sri: Compact Notion/macOS frontend refactor

Status: complete

## What changed

- Added a frontend-wide compact light visual system inspired by Notion and macOS.
- Reduced shell/topbar height and removed the heavy dashboard feel.
- Removed marketing-style hero/eyebrow/subtitle text from trace list and trace detail.
- Rebuilt API keys page as compact settings UI, removing gray slab legacy styles.
- Fixed metric card contrast so labels and values stay readable on light surfaces.
- Added a single compact Topo Tracer feature card with arrows, dots, and swipe support.
- Restyled trace list as a compact database/table surface.
- Restyled trace detail graph workspace to prevent overlapping panels and huge cards.
- Tightened buttons, pills, metrics, inspector, graph nodes, API key surfaces, and login surfaces.
- Shortened shell copy to match the compact app style.

## Verification

- `npm run build` in `frontend` passed.
- In-app browser navigation was blocked by browser tool URL policy, so live screenshot verification was not available from tools.

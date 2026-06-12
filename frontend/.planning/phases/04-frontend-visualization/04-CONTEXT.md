# Phase 4 Context: Frontend Visualization

## Domain
Phase 4 implements the UI changes in the React frontend to display trace names. This includes updating the Trace List, Trace Detail, and the Detail Sidebar.

## Decisions
### Trace List
- **D-15: Primary Identifier**: The `name` field will be the primary identifier shown in the "Trace" column.
- **D-16: Secondary Identifier**: The full `traceId` will be displayed as secondary small text below the name.
- **D-17: Search**: The search placeholder will be updated to "Trace ID or Name".

### Trace Detail
- **D-18: Page Title**: The `h1` in the detail header will display the `name`.
- **D-19: Context Rail**: The sidebar ("Recent traces") will show the `name` as the primary bold text for each entry.

## Canonical Refs
- `src/ui/TraceListPage.tsx` (List source)
- `src/ui/TraceDetailPage.tsx` (Detail source)

## Code Context
- `TraceListPage.tsx`: Update the `Link` content inside the table.
- `TraceDetailPage.tsx`: Update the `h1` and the sidebar `Link` content.

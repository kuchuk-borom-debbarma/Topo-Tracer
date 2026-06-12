# Quick Task 260612-rjy: Restrict traces to user and polish trace UX

Status: complete

## What changed

- New Hono self-tracing data now writes under `system-self-tracing`, not the logged-in user.
- Trace reads now reject internal summaries, so normal users do not see Hono route traces in list, summary, or flow APIs.
- Trace list rows are keyboard and mouse clickable, and route to the flow view with the trace's minimum importance threshold.
- Trace detail was rebuilt as a denser workbench with recent traces, metrics, threshold controls, graph canvas, paging, and inspector.
- Styling was tightened toward a modern operational tool: smaller headings, sharper panels, stable grid sizing, clearer focus states.

## Verification

- `npm run build` in `frontend` passed.
- `bun test hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` passed.
- `bunx tsc --noEmit` in `hono-server` passed.

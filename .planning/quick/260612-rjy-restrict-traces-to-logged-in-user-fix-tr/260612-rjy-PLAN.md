# Quick Task 260612-rjy: Restrict traces to user and polish trace UX

Status: in-progress

## Goal

Logged-in users should see only their own application traces, not Hono server self-tracing internals. Trace rows must open the trace flow reliably. Frontend should feel like a modern operational trace tool.

## Tasks

1. Keep new Hono self-tracing data under the system owner instead of the signed-in user.
2. Hide legacy internal traces from normal trace list, summary, and flow reads.
3. Make trace rows open the detail flow with the right route/search params.
4. Polish trace list/detail/API key UI for dense, professional workflows.
5. Run focused backend tests and frontend build.

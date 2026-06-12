---
status: complete
completed: 2026-06-13
---

Fixed Node SDK buffer overflow under rapid event production.

Changes:
- `sdks/node-js/src/Tracer.ts` now drains the buffer when it crosses the hard cap instead of dropping incoming events.
- Concurrent flush requests are coalesced through a single drain loop, so events added during an in-flight flush are sent by the same flush cycle when needed.
- `sdks/node-js/tests/integration.test.ts` now verifies 1001 rapid node starts are all sent and `onDrop` is not called.

Verification:
- `rtk bun test`
- `rtk bunx tsc -p tsconfig.json --noEmit`
- `rtk bun run build`

---
status: in-progress
created: 2026-06-13
---

Fix Node SDK buffer overflow seen when running `sdks/node-js/examples/stress-microservices.ts`.

Plan:
- Inspect SDK buffering and stress example behavior.
- Make auto-flush handle rapid event production without dropping buffered events.
- Add focused regression test for pressure above the hard cap.
- Run SDK tests/build.

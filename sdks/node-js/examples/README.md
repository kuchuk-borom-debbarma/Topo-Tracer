# Node SDK examples

- `basic.ts` - root trace metadata, nested spans, manual spans.
- `async-fanout.ts` - async fan-out with parallel work and child spans.
- `distributed/client.ts` - simulated client hop into another service.
- `distributed/server.ts` - simulated downstream service continuing parent context.
- `message-queue.ts` - simulated async queue producer/consumer handoff.
- `error-handling.ts` - failing child span and propagated error flow.
- `stress-microservices.ts` - realistic marketplace checkout megaflow with about 500 nodes across many importance levels.
- `end-to-end-demo.ts` - prompts for an API key, then runs every demo sequentially against one backend.

Each example uses fake in-process remote work. Set `TOPO_TRACER_URL` to the backend base URL, for example `http://localhost:3000`. The SDK appends `/api/v1/ingest` automatically.

`end-to-end-demo.ts` authenticates with the API key you enter at runtime. The backend resolves the owning user from that key, so the seeded demo traces land under that user.

Exact emitted trace names and label maps: [docs/example-traces.md](../docs/example-traces.md)

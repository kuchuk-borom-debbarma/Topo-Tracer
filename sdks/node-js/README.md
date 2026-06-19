# @topo-tracer/node-sdk

Node.js instrumentation SDK for Topo-Tracer.

The SDK emits graph telemetry: nodes are units of work and edges are explicit links between them. It batches those lifecycle events and sends them to the Hono backend at `/api/v1/ingest`.

## Features

- `AsyncLocalStorage` context tracking for nested spans.
- Explicit node start/end and edge start events.
- Logs as graph nodes through `tracer.log`.
- Importance levels for backend threshold projection.
- Trace-level names and importance labels.
- HTTP batching with flush interval and manual `flush`.
- Retry with exponential backoff and jitter.
- `onDrop` hook for permanent send failures.
- API-key authentication through `X-API-Key`.

## Quick Start

```ts
import { Tracer, NodeType, Importance } from "@topo-tracer/node-sdk";

const tracer = new Tracer({
  endpoint: "http://localhost:8787",
  apiKey: "tt_your_api_key",
  serviceName: "checkout-api",
  batchSize: 100,
  flushInterval: 5000,
});

await tracer.trace(
  "checkout-request",
  async (span) => {
    span.setAttribute("customer.id", "cust_demo_001");

    await tracer.trace(
      "load-cart-db",
      async (dbSpan) => {
        dbSpan.setAttribute("storage.kind", "cache");
        tracer.log("Cart found in cache", { cartId: "cart_123" }, Importance.HIGH);
      },
      { type: NodeType.DB_CALL },
    );
  },
  {
    type: NodeType.CONTROLLER,
    traceName: "Checkout Flow Demo",
    importanceLabels: {
      0: "request",
      1: "work",
      2: "detail",
    },
  },
);

await tracer.flush();
```

## Configuration

| Option | Required | Default | Notes |
| --- | --- | --- | --- |
| `endpoint` | yes | none | Base backend URL or full `/api/v1/ingest` URL. |
| `apiKey` | yes | none | Sent as `X-API-Key`. |
| `userId` | no | none | Sent as `X-User-Id` when supplied. |
| `serviceName` | no | none | Stored in config for integrations. |
| `batchSize` | no | `100` | Flush when buffered event count reaches this size. |
| `flushInterval` | no | `5000` | Periodic flush in milliseconds. Set `0` to disable timer. |
| `maxRetries` | no | `5` | Retry attempts for failed ingestion. |
| `retryDelay` | no | `1000` | Base retry delay in milliseconds. |
| `ignoreFailures` | no | `true` | When false, permanent ingestion failure throws from flush. |
| `onDrop` | no | none | Called after retries are exhausted. |
| `nodeTypeImportanceMapping` | no | built in | Override default importance by node type. |
| `logHooks` | no | none | Called when `tracer.log` runs. |
| `traceHooks` | no | none | Called on span start/end. |

## Scripts

```sh
bun test
bun run build
bun run demo:e2e
bun run demo:stress
bun run bench
```

The demos use `TOPO_TRACER_URL` and prompt for `TOPO_TRACER_API_KEY`.

## Context Helpers

`extractContext()` returns the active `{ traceId, spanId }` from AsyncLocalStorage.

`injectContext({ traceId, spanId })` returns a synthetic external span for the supplied context. It does not currently write HTTP headers by itself.

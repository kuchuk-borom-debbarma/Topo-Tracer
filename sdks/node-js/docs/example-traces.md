# Example trace catalog

This page shows exact trace-level metadata used by the SDK demo files under `sdks/node-js/examples`.

## Shared behavior

- A trace-level `TraceStart` event is emitted only for the root trace entry.
- Child spans do not emit new trace metadata.
- `importanceLabels` are stored on the trace summary and are meant to describe threshold levels for the whole trace.

## `basic.ts`

- Trace name: `Checkout Flow Demo`
- Importance labels:
  - `0 -> request`
  - `1 -> work`
  - `2 -> detail`
- Root span: `checkout-request`
- Child spans:
  - `load-cart`
  - `manual-discount-check`

## `async-fanout.ts`

- Trace name: `Async Fanout Demo`
- Importance labels:
  - `0 -> request`
  - `1 -> parallel-work`
  - `2 -> detail`
- Root span: `async-root`
- Branch spans:
  - `fanout:inventory`
  - `fanout:pricing`
  - `fanout:recommendations`
- Nested branch spans:
  - `fanout:inventory:post-process`
  - `fanout:pricing:post-process`
  - `fanout:recommendations:post-process`

## `distributed/client.ts` and `distributed/server.ts`

- Trace name: `Distributed Order Demo`
- Importance labels:
  - `0 -> request`
  - `1 -> service-hop`
  - `2 -> detail`
- Client/root spans:
  - `web.place-order`
  - `web.prepare-request`
- Downstream service spans:
  - `orders-service.handle-order`
  - `orders-service.reserve-inventory`
  - `orders-service.persist-order`

## `message-queue.ts`

- Trace name: `Async Queue Demo`
- Importance labels:
  - `0 -> request`
  - `1 -> worker-hop`
  - `2 -> detail`
- Producer/root span: `checkout.publish-shipment`
- Worker spans:
  - `worker.consume-shipment`
  - `worker.allocate-carrier`

## `error-handling.ts`

- Trace name: `Payment Failure Demo`
- Importance labels:
  - `0 -> request`
  - `1 -> critical-step`
  - `2 -> detail`
- Root span: `payment-root`
- Failing child span: `payment-authorize`

## `end-to-end-demo.ts`

Runs these demos in order:

1. `basic`
2. `async-fanout`
3. `distributed-rpc`
4. `message-queue`
5. `error-handling`

Use it when you want one seeded session containing all supported demo patterns.

When you run it, it prompts for a Topo-Tracer API key first. That key is sent on each ingest request, and the backend assigns the traces to the user who owns that key.

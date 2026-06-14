# @topo-tracer/node-sdk

A lightweight, high-performance Node.js SDK for Topo-Tracer, focused on graph-based telemetry and distributed tracing.

## Features

- **Fluent API:** Intuitive span and edge creation.
- **Automatic Context Tracking:** Uses `AsyncLocalStorage` to manage trace context across asynchronous boundaries.
- **Distributed Tracing:** Seamless context propagation between services via HTTP headers.
- **Efficient Ingestion:** Batching and compressed payloads for minimal overhead.
- **Resilient:** Built-in retry logic with exponential backoff and jitter.
- **Lightweight:** Zero dependencies (except for optional framework integrations).

## Installation

```bash
bun add @topo-tracer/node-sdk
# or
npm install @topo-tracer/node-sdk
```

## Quick Start

```typescript
import { Tracer } from '@topo-tracer/node-sdk';

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'your-api-key',
  serviceName: 'my-service'
});

async function main() {
  await tracer.trace('process-order', async (span) => {
    span.setAttribute('orderId', '12345');
    
    await tracer.trace('validate-payment', async (paymentSpan) => {
      // payment logic...
      paymentSpan.setAttribute('status', 'success');
    });
  });

  // Ensure all spans are sent before exiting
  await tracer.flush();
}

main();
```

## API Reference

### `Tracer`

The main entry point for the SDK.

#### `constructor(config: TracerConfig)`

- `endpoint`: The Topo-Tracer ingestion endpoint.
- `apiKey`: Your API key for authentication.
- `serviceName`: Name of the service being traced.
- `batchSize`: (Optional) Number of spans to batch before sending (default: 100).
- `flushInterval`: (Optional) Interval in ms to flush the batch (default: 5000).
- `retries`: (Optional) Number of retry attempts for failed requests (default: 3).

#### `trace<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>`

Starts a new span and executes the provided function within the span context.
For a new root trace, `name` also becomes the trace name. Pass
`{ traceName: "..." }` to override it.

#### `createSpan(name: string, options?: SpanOptions): Span`

Creates a span manually. Requires manual ending with `span.end()`.

#### `extractContext(headers: Record<string, string | string[] | undefined>): TraceContext | null`

Extracts trace context from incoming HTTP headers.

#### `injectContext(headers: Record<string, string | string[] | undefined>): void`

Injects current trace context into outgoing HTTP headers.

#### `flush(): Promise<void>`

Immediately sends all buffered spans to the server.

### `Span`

Represents a single unit of work in a trace.

#### `setAttribute(key: string, value: any): this`

Adds an attribute to the span.

#### `end(): void`

Ends the span and adds it to the batch.

## Configuration

The SDK can be configured via the `TracerConfig` object passed to the constructor.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `endpoint` | `string` | **Required** | Ingestion server URL |
| `apiKey` | `string` | **Required** | API Key for auth |
| `serviceName` | `string` | **Required** | Name of your service |
| `batchSize` | `number` | `100` | Max spans per batch |
| `flushInterval`| `number` | `5000` | Flush interval in ms |
| `maxRetries` | `number` | `3` | Max retry attempts |
| `onDrop` | `Function`| `undefined` | Hook called when spans are dropped |

## License

MIT

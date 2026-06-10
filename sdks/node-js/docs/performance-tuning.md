# Performance Tuning

The Topo-Tracer Node.js SDK is designed for minimal overhead. However, in high-throughput environments, you can tune several parameters to optimize performance and resource usage.

## Batching

Batching is the most effective way to reduce the number of HTTP requests made by the SDK.

```typescript
const tracer = new Tracer({
  batchSize: 500,       // Maximum number of spans in a single request
  flushInterval: 10000, // Flush every 10 seconds if batchSize isn't reached
});
```

- **Higher `batchSize`:** Better throughput, but higher memory usage and slightly more latency for spans to appear in the dashboard.
- **Lower `batchSize`:** More frequent requests, but spans appear faster.

## Memory Management

The SDK buffers spans in memory. If the ingestion server is slow or down, the buffer could grow.

### `onDrop` Hook

Use the `onDrop` hook to monitor when spans are dropped due to full buffers or permanent ingestion failures.

```typescript
const tracer = new Tracer({
  onDrop: (spans, reason) => {
    console.warn(`Dropped ${spans.length} spans. Reason: ${reason}`);
  }
});
```

## Retry Strategy

The SDK automatically retries failed ingestion requests.

```typescript
const tracer = new Tracer({
  maxRetries: 5,
  retryDelay: 1000, // Base delay in ms
});
```

The SDK uses exponential backoff with jitter to prevent "thundering herd" issues when the ingestion server recovers.

## Environment-Specific Tuning

### Production
- Use a larger `batchSize` (e.g., 1000).
- Set `flushInterval` to a reasonable value (e.g., 5-10 seconds).
- Ensure `serviceName` is correctly set for filtering.

### Development/Lambda
- Use a smaller `batchSize` (e.g., 1) if you want to see spans immediately.
- Always call `await tracer.flush()` before the process exits (crucial for serverless environments).

## Overhead Considerations

The SDK uses `AsyncLocalStorage` for context tracking. While highly efficient in modern Node.js versions, it does have a non-zero overhead. For extremely latency-sensitive paths, consider manual span management or verify the impact with benchmarks.

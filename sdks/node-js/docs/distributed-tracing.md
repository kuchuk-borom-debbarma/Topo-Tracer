# Distributed Tracing with Topo-Tracer

Distributed tracing allows you to track requests as they move through multiple services. Topo-Tracer makes this easy by providing tools for context propagation.

## How it Works

Context propagation involves two steps:
1. **Injection:** Adding trace context to outgoing requests (e.g., as HTTP headers).
2. **Extraction:** Reading trace context from incoming requests.

Topo-Tracer uses the following headers for propagation:
- `x-topo-trace-id`: The unique ID of the trace.
- `x-topo-parent-id`: The ID of the span that triggered the current operation.

## Example: Service A to Service B

### Service A (Client)

When making a request to Service B, inject the current context into the headers.

```typescript
import { Tracer } from '@topo-tracer/node-sdk';

const tracer = new Tracer({ ... });

async function callServiceB() {
  await tracer.trace('call-service-b', async (span) => {
    const headers = {};
    // Injects x-topo-trace-id and x-topo-parent-id
    tracer.injectContext(headers);

    const response = await fetch('http://service-b/api', { headers });
    return response.json();
  });
}
```

### Service B (Server)

On the receiving end, extract the context to continue the trace.

```typescript
import { Tracer } from '@topo-tracer/node-sdk';

const tracer = new Tracer({ ... });

// In your request handler
async function handleRequest(req, res) {
  const context = tracer.extractContext(req.headers);
  
  await tracer.trace('handle-api-request', async (span) => {
    // This span will be a child of the span from Service A
    span.setAttribute('method', req.method);
    
    // Your logic...
    res.send({ status: 'ok' });
  }, { parentContext: context }); // Optional if using AsyncLocalStorage automatically
}
```

## AsyncLocalStorage Support

The SDK uses `AsyncLocalStorage` to automatically track the current span. If you use `tracer.trace()`, any nested calls to `tracer.trace()` or `tracer.createSpan()` will automatically correctly set the parent, even across asynchronous boundaries.

When extracting context in a middleware, you can ensure all subsequent operations are linked:

```typescript
// Middleware example
app.use(async (req, res, next) => {
  const context = tracer.extractContext(req.headers);
  
  // Use a root trace to wrap the entire request
  await tracer.trace(req.path, async (span) => {
    await next();
  }, { parentContext: context });
});
```

import { Tracer } from '../../src';

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'dev-key',
  serviceName: 'order-service',
});

// Mock request handler
async function handleRequest(headers: Record<string, string>) {
  // 1. Extract context from headers
  const parentContext = tracer.extractContext(headers);

  // 2. Wrap processing in a span linked to the parent
  return await tracer.trace('process-request', async (span) => {
    span.setAttribute('http.method', 'POST');
    span.setAttribute('http.path', '/orders');

    console.log(`Processing order with TraceID: ${span.context.traceId}`);

    await sleep(100);
    
    return { status: 'success', orderId: 'ord_123' };
  }, { parentContext: parentContext || undefined });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulate receiving a request
const incomingHeaders = {
  'x-topo-trace-id': 'mock-trace-123',
  'x-topo-parent-id': 'mock-span-456'
};

console.log('Server: Received request with headers', incomingHeaders);
handleRequest(incomingHeaders).then(response => {
  console.log('Server: Response sent', response);
  tracer.flush();
});

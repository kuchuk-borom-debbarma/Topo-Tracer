import { Tracer } from '../src';

/**
 * Error Handling and Resilience Example
 * 
 * Demonstrates:
 * 1. Using the onDrop hook for observability of the SDK itself.
 * 2. How the SDK handles ingestion failures (retries).
 */

const tracer = new Tracer({
  endpoint: 'http://localhost:9999', // Point to a non-existent server to trigger retries/drops
  apiKey: 'dev-key',
  serviceName: 'error-prone-service',
  maxRetries: 2,
  retryDelay: 100,
  batchSize: 5,
  onDrop: (spans, reason) => {
    console.error(`!!! SDK dropped ${spans.length} spans. Reason: ${reason}`);
    console.error(`Example of first dropped span: ${spans[0].name}`);
  }
});

async function runErrorExample() {
  console.log('Starting error handling example...');
  console.log('Ingestion is pointed to a non-existent server to demonstrate failure handling.');

  // Create some spans to fill a batch
  for (let i = 0; i < 10; i++) {
    await tracer.trace(`operation-${i}`, async (span) => {
      span.setAttribute('index', i);
      await new Promise(r => setTimeout(r, 10));
    });
  }

  console.log('Waiting for background flush and retries...');
  // The SDK will try to flush, fail, retry, and eventually drop if maxRetries is reached.
  // In our case, tracer.flush() will throw or the background interval will handle it.
  
  try {
    await tracer.flush();
  } catch (err) {
    console.log('Expected: tracer.flush() failed after retries.');
  }

  console.log('Done with error example.');
}

runErrorExample().catch(console.error);

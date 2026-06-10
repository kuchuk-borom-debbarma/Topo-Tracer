import { Tracer } from '../src';

/**
 * Basic Usage Example
 * 
 * Shows how to:
 * 1. Initialize the tracer
 * 2. Use the fluent tracer.trace() API
 * 3. Manually create spans
 * 4. Set attributes
 */

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'dev-key',
  serviceName: 'basic-example-service',
  batchSize: 10,
  flushInterval: 1000,
});

async function runExample() {
  console.log('Starting basic example...');

  // 1. Fluent API with automatic context
  await tracer.trace('parent-operation', async (parentSpan) => {
    parentSpan.setAttribute('app.version', '1.0.0');
    console.log('Inside parent span');

    await sleep(100);

    await tracer.trace('child-operation', async (childSpan) => {
      childSpan.setAttribute('operation.type', 'compute');
      console.log('Inside child span');
      await sleep(200);
    });
  });

  // 2. Manual span creation
  const manualSpan = tracer.createSpan('manual-span');
  manualSpan.setAttribute('isManual', true);
  console.log('Manual span started');
  await sleep(150);
  manualSpan.end();
  console.log('Manual span ended');

  // Ensure everything is sent
  console.log('Flushing spans...');
  await tracer.flush();
  console.log('Done!');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runExample().catch(console.error);

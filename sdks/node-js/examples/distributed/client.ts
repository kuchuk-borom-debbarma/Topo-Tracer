import { Tracer } from '../../src';

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'dev-key',
  serviceName: 'web-frontend',
});

async function placeOrder() {
  await tracer.trace('place-order-ui', async (span) => {
    console.log('Client: Starting placeOrder');

    // Prepare headers for outgoing request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Injects current context into headers
    tracer.injectContext(headers);
    
    console.log('Client: Injected headers', headers);

    // Simulate fetch call to order-service
    await sleep(50);
    console.log('Client: Request sent to order-service');
  });

  await tracer.flush();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

placeOrder().catch(console.error);

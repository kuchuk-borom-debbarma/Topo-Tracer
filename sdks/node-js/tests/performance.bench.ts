import { bench, run, group } from 'mitata';
import { Tracer } from '../src';

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'bench-key',
  serviceName: 'bench-service',
  batchSize: 1000,
});

// Mock the fetch call to avoid actual network I/O during benchmarking of SDK logic
// @ts-ignore
global.fetch = async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

group('Span Creation', () => {
  bench('Tracer.createSpan', () => {
    const span = tracer.createSpan('test-span');
    span.end();
  });

  bench('Tracer.trace (fluent)', async () => {
    await tracer.trace('test-span', async () => {
      // no-op
    });
  });
});

group('Attributes', () => {
  bench('Span.setAttribute (string)', () => {
    const span = tracer.createSpan('test');
    span.setAttribute('key', 'value');
    span.end();
  });

  bench('Span.setAttribute (multiple)', () => {
    const span = tracer.createSpan('test');
    for (let i = 0; i < 5; i++) {
      span.setAttribute(`key-${i}`, i);
    }
    span.end();
  });
});

group('Context Propagation', () => {
  bench('Tracer.injectContext', () => {
    const headers = {};
    tracer.injectContext(headers);
  });

  bench('Tracer.extractContext', () => {
    const headers = {
      'x-topo-trace-id': 'trace-123',
      'x-topo-parent-id': 'span-456'
    };
    tracer.extractContext(headers);
  });
});

await run();

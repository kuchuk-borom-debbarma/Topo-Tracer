import { expect, test, describe } from 'bun:test';
import { Tracer } from '../src';

describe('Resilience & Stress Tests', () => {
  
  test('should retry on 503 errors and eventually succeed', async () => {
    const tracer = new Tracer({
      endpoint: 'http://localhost:3000',
      apiKey: 'test-key',
      userId: 'test-user',
      maxRetries: 3,
      retryDelay: 10, // Fast retries for test
    });

    let callCount = 0;
    // @ts-ignore
    global.fetch = async () => {
      callCount++;
      if (callCount < 3) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    await tracer.trace('test-span', async () => {});
    await tracer.flush();

    expect(callCount).toBe(3);
  });

  test('should respect 429 Rate Limit and retry', async () => {
    const tracer = new Tracer({
      endpoint: 'http://localhost:3000',
      apiKey: 'test-key',
      userId: 'test-user',
      maxRetries: 2,
      retryDelay: 10,
    });

    let callCount = 0;
    // @ts-ignore
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Too Many Requests', { status: 429 });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    await tracer.trace('test-span', async () => {});
    await tracer.flush();

    expect(callCount).toBe(2);
  });

  test('should call onDrop after exhausting retries', async () => {
    let droppedSpans: any = null;
    let dropReason = '';

    const tracer = new Tracer({
      endpoint: 'http://localhost:3000',
      apiKey: 'test-key',
      userId: 'test-user',
      maxRetries: 1,
      retryDelay: 10,
      onDrop: (spans, reason) => {
        droppedSpans = spans;
        dropReason = reason;
      }
    });

    // @ts-ignore
    global.fetch = async () => {
      return new Response('Permanent Error', { status: 500 });
    };

    await tracer.trace('test-span', async () => {});
    
    try {
      await tracer.flush();
    } catch (e) {
      // Expected failure
    }

    expect(droppedSpans).not.toBeNull();
    expect(dropReason).toContain('Failed to send batch after');
  });

  test('high load: should handle 1000 spans rapidly', async () => {
    const tracer = new Tracer({
      endpoint: 'http://localhost:3000',
      apiKey: 'test-key',
      userId: 'test-user',
      batchSize: 100,
    });

    let totalSpansReceived = 0;
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      totalSpansReceived += body.nodeStarts.length;
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(tracer.trace(`span-${i}`, async () => {}));
    }

    await Promise.all(promises);
    await tracer.flush();

    expect(totalSpansReceived).toBe(1000);
  });
});

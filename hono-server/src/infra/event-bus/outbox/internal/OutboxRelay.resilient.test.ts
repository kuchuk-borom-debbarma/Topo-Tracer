// fallow-ignore-file
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { OutboxRelay } from "./OutboxRelay";
import { InMemoryOutboxStore } from "./InMemoryOutboxStore";
import { IEventBus } from "../../api/IEventBus";

class MockEventBus extends IEventBus {
  publish = mock(async () => {});
  subscribe = mock(async () => {});
}

describe("OutboxRelay Resiliency", () => {
  let originalSetTimeout: typeof setTimeout;
  const timeoutCalls: Array<{ fn: Function; delay: number }> = [];

  beforeEach(() => {
    originalSetTimeout = global.setTimeout;
    timeoutCalls.length = 0;

    // Mock setTimeout to record scheduling delays
    (global as any).setTimeout = mock((fn: Function, delay: number) => {
      timeoutCalls.push({ fn, delay });
      // Return a dummy timeout object
      return {
        unref: () => {},
      } as any;
    });
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  it("should prevent overlapping schedules by waiting for poll to resolve", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    const relay = new OutboxRelay(outboxStore, eventBus, 2000);

    let resolvePoll: (() => void) | null = null;
    const pollPromise = new Promise<void>((resolve) => {
      resolvePoll = resolve;
    });

    // Mock poll to wait for our trigger
    relay.poll = mock(async () => {
      await pollPromise;
      return true;
    });

    relay.start();

    // Verify first setTimeout was scheduled
    expect(timeoutCalls).toHaveLength(1);
    expect(timeoutCalls[0].delay).toBe(2000);

    // Trigger the timeout callback (simulating timeout firing)
    const callback = timeoutCalls[0].fn;
    const executionPromise = callback();

    // Since poll is in-flight, it should not schedule the next run yet
    expect(timeoutCalls).toHaveLength(1);

    // Resolve the poll
    resolvePoll!();
    await executionPromise;

    // After poll finishes, it should schedule the next execution
    expect(timeoutCalls).toHaveLength(2);
    expect(timeoutCalls[1].delay).toBe(2000);
  });

  it("should increase delay exponentially on failures and reset on success", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    const relay = new OutboxRelay(outboxStore, eventBus, 2000, 10, 60000);

    // Simulate persistent failures
    relay.poll = mock(async () => false);

    relay.start();

    // 1st iteration: Firing first schedule
    const callback1 = timeoutCalls[0].fn;
    await callback1();

    // Expect 2nd schedule to have exponential backoff.
    // delay = base * 2^(failures-1) -> 2000 * 2^0 = 2000 (plus jitter)
    expect(timeoutCalls).toHaveLength(2);
    expect(timeoutCalls[1].delay).toBeGreaterThan(1999);
    expect(timeoutCalls[1].delay).toBeLessThan(4000); // 2000 + 30% jitter max

    // 2nd iteration: Fire and fail again
    const callback2 = timeoutCalls[1].fn;
    await callback2();

    // Expect 3rd schedule to have larger backoff.
    // delay = 2000 * 2^1 = 4000 (plus jitter)
    expect(timeoutCalls).toHaveLength(3);
    expect(timeoutCalls[2].delay).toBeGreaterThan(3999);
    expect(timeoutCalls[2].delay).toBeLessThan(6000); // 4000 + 30% jitter max

    // Now simulate success
    relay.poll = mock(async () => true);

    const callback3 = timeoutCalls[2].fn;
    await callback3();

    // Success should reset failureCount. Next delay should return to base interval (2000)
    expect(timeoutCalls).toHaveLength(4);
    expect(timeoutCalls[3].delay).toBe(2000);
  });

  it("should wait for in-flight poll to finish during graceful shutdown", async () => {
    const outboxStore = new InMemoryOutboxStore();
    const eventBus = new MockEventBus();
    const relay = new OutboxRelay(outboxStore, eventBus, 2000);

    let resolvePoll: (() => void) | null = null;
    const pollPromise = new Promise<void>((resolve) => {
      resolvePoll = resolve;
    });

    relay.poll = mock(async () => {
      await pollPromise;
      return true;
    });

    relay.start();

    // Fire the poller
    const callback = timeoutCalls[0].fn;
    const executionPromise = callback();

    // Initiate stop
    let stopResolved = false;
    const stopPromise = relay.stop().then(() => {
      stopResolved = true;
    });

    // Stop shouldn't resolve immediately because poll is in-flight
    expect(stopResolved).toBe(false);

    // Resolve in-flight poll
    resolvePoll!();
    await executionPromise;
    await stopPromise;

    // Verify stop resolved successfully
    expect(stopResolved).toBe(true);

    // Verify no further timeouts were scheduled
    expect(timeoutCalls).toHaveLength(1);
  });
});

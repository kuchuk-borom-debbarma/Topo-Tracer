import { IOutboxStore } from "../api/IOutboxStore";
import { IEventBus } from "../../api/IEventBus";

/**
 * Background outbox processor that periodically polls PostgreSQL outbox_events,
 * publishes them to the message broker/event bus, and updates their state.
 * Following production-grade resilience standards:
 * - Prevents overlapping execution by using a recursive setTimeout cycle.
 * - Scales polling backoff exponentially with jitter during event bus or DB failures.
 * - Supports configurable batch sizes, polling intervals, and lock timeouts.
 * - Implements async graceful shutdown to await in-flight batch execution.
 */
export class OutboxRelay {
  private isActive = false;
  private isPolling = false;
  private timeoutId: any | null = null;
  private failureCount = 0;
  private shutdownResolve: (() => void) | null = null;

  // fallow-ignore-next-line complexity
  constructor(
    private readonly outboxStore: IOutboxStore,
    private readonly eventBus: IEventBus,
    private readonly intervalMs = Number(
      (typeof process !== "undefined" ? process.env.OUTBOX_POLL_INTERVAL_MS : undefined) ?? 2000
    ),
    private readonly batchSize = Number(
      (typeof process !== "undefined" ? process.env.OUTBOX_BATCH_SIZE : undefined) ?? 100
    ),
    private readonly maxBackoffMs = Number(
      (typeof process !== "undefined" ? process.env.OUTBOX_MAX_BACKOFF_MS : undefined) ?? 60000
    ),
  ) {}

  /**
   * Starts the polling loop.
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.shutdownResolve = null;
    this.scheduleNext();
  }

  /**
   * Stops the polling loop and returns a promise that resolves once any in-flight poll finishes.
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.isPolling) {
      return new Promise<void>((resolve) => {
        this.shutdownResolve = resolve;
      });
    }
  }

  /**
   * Schedules the next poll execution using exponential backoff with random jitter on failures.
   */
  // fallow-ignore-next-line complexity
  private scheduleNext(): void {
    if (!this.isActive) return;

    let delay = this.intervalMs;
    if (this.failureCount > 0) {
      // Exponential backoff: delay = base * 2^(failures - 1)
      const factor = Math.min(Math.pow(2, this.failureCount - 1), 30); // Cap multiplier at 30x
      const backoffDelay = this.intervalMs * factor;
      // Add random jitter between 0% and 30% of backoff delay to prevent sync storming
      const jitter = backoffDelay * 0.3 * Math.random();
      delay = Math.min(backoffDelay + jitter, this.maxBackoffMs);
    }

    this.timeoutId = setTimeout(() => this.pollNext(), delay);

    // Prevent active timeout from keeping process alive in Node/Bun environment tests
    if (this.timeoutId && typeof this.timeoutId.unref === "function") {
      this.timeoutId.unref();
    }
  }

  /**
   * Wrapper execution for recursive timeout loop.
   */
  // fallow-ignore-next-line complexity
  private async pollNext(): Promise<void> {
    if (!this.isActive || this.isPolling) return;
    this.isPolling = true;

    try {
      const success = await this.poll();
      if (success) {
        this.failureCount = 0;
      } else {
        this.failureCount++;
      }
    } catch (err) {
      this.failureCount++;
      console.error(`[OutboxRelay] Uncaught critical error in poll next (failures: ${this.failureCount}):`, err);
    } finally {
      this.isPolling = false;

      if (this.isActive) {
        this.scheduleNext();
      } else if (this.shutdownResolve) {
        this.shutdownResolve();
        this.shutdownResolve = null;
      }
    }
  }

  /**
   * Claims pending events, publishes them, and updates their final database state.
   * Returns true if successfully completed, false if errors occurred.
   */
  // fallow-ignore-next-line complexity
  async poll(): Promise<boolean> {
    try {
      // Reclaim any outbox events stuck in 'processing' status (e.g. due to previous instance crash)
      const lockExpiryMs = Number(
        (typeof process !== "undefined" ? process.env.OUTBOX_LOCK_EXPIRY_MS : undefined) ?? 300000
      );
      await this.outboxStore.recoverStuck(lockExpiryMs);

      const claimedEvents = await this.outboxStore.claimPending(this.batchSize);
      if (claimedEvents.length === 0) {
        return true;
      }

      const eventIds = claimedEvents.map((e) => e.id);

      try {
        const publishEvents = claimedEvents.map((e) => ({
          topic: e.topic,
          idempotencyId: e.idempotencyId,
          key: e.key,
          data: e.data,
        }));

        // Publish to event bus bypassing the outbox interception
        await this.eventBus.publish(publishEvents, { bypassOutbox: true });

        // Update to sent on success
        await this.outboxStore.markSent(eventIds);
      } catch (publishError) {
        console.error("[OutboxRelay] Failed to publish events. Reverting to pending:", publishError);
        // Revert to pending on failure to retry on subsequent intervals
        await this.outboxStore.markFailed(eventIds);
        return false;
      }

      return true;
    } catch (claimError) {
      console.error("[OutboxRelay] Error claiming pending outbox events:", claimError);
      return false;
    }
  }
}

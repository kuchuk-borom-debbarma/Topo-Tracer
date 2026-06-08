import { IOutboxStore } from "../api/IOutboxStore";
import { IEventBus } from "../../event-bus/api/IEventBus";

/**
 * Background outbox processor that periodically polls PostgreSQL outbox_events,
 * publishes them to the message broker/event bus, and updates their state.
 */
export class OutboxRelay {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly outboxStore: IOutboxStore,
    private readonly eventBus: IEventBus,
    private readonly intervalMs = 2000,
  ) {}

  /**
   * Starts the polling loop.
   */
  // fallow-ignore-next-line unused-class-member
  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.poll().catch((err) => {
        console.error("[OutboxRelay] Uncaught error in poll loop:", err);
      });
    }, this.intervalMs);
    // Prevent the interval from keeping the process alive in Node/Bun environment tests
    if (typeof this.intervalId.unref === "function") {
      this.intervalId.unref();
    }
  }

  /**
   * Stops the polling loop.
   */
  // fallow-ignore-next-line unused-class-member
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Claims pending events, publishes them, and updates their final database state.
   */
  // fallow-ignore-next-line complexity
  async poll(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Reclaim any outbox events stuck in 'processing' status for over 5 minutes (e.g. due to node crash)
      await this.outboxStore.recoverStuck(5 * 60 * 1000);

      const claimedEvents = await this.outboxStore.claimPending(100);
      if (claimedEvents.length === 0) {
        return;
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
      }
    } catch (claimError) {
      console.error("[OutboxRelay] Error claiming pending outbox events:", claimError);
    } finally {
      this.isRunning = false;
    }
  }
}

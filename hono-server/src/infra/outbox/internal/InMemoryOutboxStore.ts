import { IOutboxStore, OutboxEvent } from "../api/IOutboxStore";
import { EventBusPublishEvent } from "../../event-bus/api/types";

/**
 * In-memory implementation of IOutboxStore.
 * Designed for testing without requiring a PostgreSQL instance.
 */
export class InMemoryOutboxStore extends IOutboxStore {
  private events: OutboxEvent[] = [];

  async save(events: EventBusPublishEvent[], tx?: any): Promise<void> {
    void tx;
    this.events.push(
      ...events.map((event): OutboxEvent => ({
        id: crypto.randomUUID(),
        topic: event.topic,
        idempotencyId: event.idempotencyId,
        key: event.key,
        data: event.data,
        status: "pending",
        createdAt: new Date(),
        sentAt: null,
      }))
    );
  }

  async claimPending(limit = 100): Promise<OutboxEvent[]> {
    const pending = this.events
      .filter((e) => e.status === "pending")
      .slice(0, limit);

    for (const event of pending) {
      event.status = "processing";
    }

    return pending.map((e) => ({ ...e }));
  }

  private updateStatus(ids: string[], status: OutboxEvent["status"], setSentAt = false): void {
    const idSet = new Set(ids);
    for (const event of this.events) {
      if (idSet.has(event.id)) {
        event.status = status;
        if (setSentAt) {
          event.sentAt = new Date();
        }
      }
    }
  }

  async markSent(ids: string[]): Promise<void> {
    this.updateStatus(ids, "sent", true);
  }

  async markFailed(ids: string[]): Promise<void> {
    this.updateStatus(ids, "pending");
  }

  async recoverStuck(olderThanMs: number): Promise<void> {
    const cutoffTime = Date.now() - olderThanMs;
    for (const event of this.events) {
      if (event.status === "processing" && event.createdAt.getTime() < cutoffTime) {
        event.status = "pending";
      }
    }
  }

  // Helper method for assertions in tests
  getAllEvents(): OutboxEvent[] {
    return this.events;
  }

  // fallow-ignore-next-line unused-class-member
  clear(): void {
    this.events = [];
  }
}

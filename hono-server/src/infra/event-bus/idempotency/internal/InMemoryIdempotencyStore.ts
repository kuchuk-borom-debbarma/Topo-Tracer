import { IIdempotencyStore } from "../api/IIdempotencyStore";

/**
 * Standalone in-memory implementation of IIdempotencyStore.
 * Following code-base.md guidelines:
 * - Resides in internal/ to keep store-specific logic private.
 * - Simple Map-based storage with lazy expiration.
 */
export class InMemoryIdempotencyStore extends IIdempotencyStore {
  private readonly store = new Map<string, number>();

  /**
   * Checks if the event has been seen and is not expired.
   */
  async isProcessed(consumerName: string, idempotencyId: string): Promise<boolean> {
    const key = this.buildKey(consumerName, idempotencyId);
    const expiresAt = this.store.get(key);

    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Marks the event as processed with a 24-hour expiration.
   */
  async markProcessed(consumerName: string, idempotencyId: string): Promise<void> {
    const key = this.buildKey(consumerName, idempotencyId);
    const ttlMs = 24 * 60 * 60 * 1000; // 24 hours
    this.store.set(key, Date.now() + ttlMs);
  }

  private buildKey(consumerName: string, idempotencyId: string): string {
    return `${consumerName}:${idempotencyId}`;
  }
}

import { ICache } from "../../../cache/api/ICache";
import { IIdempotencyStore } from "../api/IIdempotencyStore";

/**
 * Implementation of IIdempotencyStore that uses an ICache as the backing store.
 * Following code-base.md guidelines:
 * - Resides in internal/ to hide store-specific logic.
 * - Wraps the general-purpose cache with idempotency-specific semantics.
 */
export class CacheIdempotencyStore extends IIdempotencyStore {
  constructor(private readonly cache: ICache) {
    super();
  }

  /**
   * Checks the cache for an existing entry.
   * Scopes the key by consumerName to isolate deduplication between groups.
   */
  async isProcessed(consumerName: string, idempotencyId: string): Promise<boolean> {
    const cacheKey = this.buildKey(consumerName, idempotencyId);
    const result = await this.cache.get<string>(cacheKey);
    return result !== null;
  }

  /**
   * Sets a value in the cache with a 24-hour TTL.
   */
  async markProcessed(consumerName: string, idempotencyId: string): Promise<void> {
    const cacheKey = this.buildKey(consumerName, idempotencyId);
    // Use a 24-hour TTL (86,400 seconds) to balance storage utilization with safety.
    await this.cache.set(cacheKey, "true", 86400);
  }

  private buildKey(consumerName: string, idempotencyId: string): string {
    return `eb:idemp:${consumerName}:${idempotencyId}`;
  }
}

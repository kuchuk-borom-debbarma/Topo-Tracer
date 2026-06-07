import { ICache } from "../api/ICache";

type CacheEntry<T> = {
  value: T;
  expiresAt?: number; // absolute timestamp in milliseconds
};

/**
 * In-memory Cache implementation for local development.
 * Following code-base.md guidelines:
 * - Resides under internal/ to keep store-specific logic private.
 * - Inherits from the abstract ICache contract.
 */
export class InMemoryCache extends ICache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /**
   * Retrieves a value from the in-memory store.
   * If an item has expired, it is lazily deleted and null is returned.
   */
  // fallow-ignore-next-line unused-class-member
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Stores a value with an optional expiry timestamp.
   */
  // fallow-ignore-next-line unused-class-member
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Deletes a value by key.
   */
  // fallow-ignore-next-line unused-class-member
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Clears the entire store.
   */
  // fallow-ignore-next-line unused-class-member
  async clear(): Promise<void> {
    this.store.clear();
  }
}

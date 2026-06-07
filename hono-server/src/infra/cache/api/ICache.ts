/**
 * Interface contract for the Cache infrastructure service.
 * Following code-base.md guidelines:
 * - Public interfaces reside inside api/.
 * - Keeps callers decoupled from concrete cache store engines (e.g. Redis, memcached, in-memory).
 */
export abstract class ICache {
  /**
   * Retrieves an item from the cache.
   * 
   * @param key - The cache key.
   * @returns The cached value of type T, or null if not found or expired.
   */
  // fallow-ignore-next-line unused-class-member
  abstract get<T>(key: string): Promise<T | null>;

  /**
   * Stores an item in the cache.
   * 
   * @param key - The cache key.
   * @param value - The value to store.
   * @param ttlSeconds - Optional time-to-live in seconds.
   */
  // fallow-ignore-next-line unused-class-member
  abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Removes an item from the cache.
   * 
   * @param key - The cache key.
   */
  // fallow-ignore-next-line unused-class-member
  abstract delete(key: string): Promise<void>;

  /**
   * Clears all items from the cache.
   */
  // fallow-ignore-next-line unused-class-member
  abstract clear(): Promise<void>;
}

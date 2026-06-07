import { ICache } from "../api/ICache";

/**
 * Spoof/Bypass Cache implementation.
 * Always returns null (cache miss) and performs no-ops on writes, deletes, and clears.
 * Following code-base.md guidelines:
 * - Resides under internal/ to keep store-specific logic private.
 * - Inherits from the abstract ICache contract.
 */
export class SpoofCache extends ICache {
  /**
   * Always returns null to simulate a cache miss.
   */
  async get<T>(key: string): Promise<T | null> {
    void key;
    return null;
  }

  /**
   * No-op implementation for set.
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    void key;
    void value;
    void ttlSeconds;
  }

  /**
   * No-op implementation for delete.
   */
  async delete(key: string): Promise<void> {
    void key;
  }

  /**
   * No-op implementation for clear.
   */
  // fallow-ignore-next-line unused-class-member
  async clear(): Promise<void> {
    // No-op
  }
}

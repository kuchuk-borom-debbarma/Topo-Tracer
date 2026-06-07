// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { InMemoryCache } from "./InMemoryCache";

describe("InMemoryCache", () => {
  it("should retrieve set values before expiration", async () => {
    const cache = new InMemoryCache();
    await cache.set("key1", "value1");

    expect(await cache.get("key1")).toBe("value1");
  });

  it("should return null for non-existent keys", async () => {
    const cache = new InMemoryCache();
    expect(await cache.get("non-existent")).toBeNull();
  });

  it("should lazily delete and return null for expired keys", async () => {
    const cache = new InMemoryCache();
    const originalNow = Date.now;
    let mockTime = 1000000;
    Date.now = () => mockTime;

    try {
      // Set key with 5 seconds TTL (expires at mockTime + 5000)
      await cache.set("key-exp", "value-exp", 5);

      // Check immediately (should be present)
      expect(await cache.get("key-exp")).toBe("value-exp");

      // Advance time by 6 seconds
      mockTime += 6000;

      // Check after expiration (should be deleted and return null)
      expect(await cache.get("key-exp")).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });

  it("should delete keys correctly", async () => {
    const cache = new InMemoryCache();
    await cache.set("key-del", "value");
    expect(await cache.get("key-del")).toBe("value");

    await cache.delete("key-del");
    expect(await cache.get("key-del")).toBeNull();
  });

  it("should clear the store entirely", async () => {
    const cache = new InMemoryCache();
    await cache.set("k1", "v1");
    await cache.set("k2", "v2");

    await cache.clear();

    expect(await cache.get("k1")).toBeNull();
    expect(await cache.get("k2")).toBeNull();
  });
});

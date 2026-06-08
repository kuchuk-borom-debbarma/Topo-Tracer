import { describe, expect, it } from "bun:test";
import { InMemoryIdempotencyStore } from "./InMemoryIdempotencyStore";

describe("InMemoryIdempotencyStore", () => {
  it("should mark and check processed events", async () => {
    const store = new InMemoryIdempotencyStore();
    const consumer = "test-consumer";
    const id = "evt-123";

    expect(await store.isProcessed(consumer, id)).toBe(false);
    
    await store.markProcessed(consumer, id);
    expect(await store.isProcessed(consumer, id)).toBe(true);
  });

  it("should isolate by consumer name", async () => {
    const store = new InMemoryIdempotencyStore();
    const id = "evt-shared";

    await store.markProcessed("consumer-a", id);
    
    expect(await store.isProcessed("consumer-a", id)).toBe(true);
    expect(await store.isProcessed("consumer-b", id)).toBe(false);
  });

  it("should respect lazy expiration", async () => {
    const store = new InMemoryIdempotencyStore();
    const originalNow = Date.now;
    let mockTime = 1000;
    Date.now = () => mockTime;

    try {
      await store.markProcessed("c", "id");
      expect(await store.isProcessed("c", "id")).toBe(true);

      // Advance 25 hours
      mockTime += 25 * 60 * 60 * 1000;
      expect(await store.isProcessed("c", "id")).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });
});

// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { SpoofCache } from "./SpoofCache";

describe("SpoofCache", () => {
  it("should always return null and behave as a no-op store", async () => {
    const cache = new SpoofCache();

    // Verification of read on empty cache
    expect(await cache.get("test-key")).toBeNull();

    // Verify set is a no-op
    await cache.set("test-key", "some-value", 100);
    expect(await cache.get("test-key")).toBeNull();

    // Verify delete is a no-op
    await cache.delete("test-key");
    expect(await cache.get("test-key")).toBeNull();

    // Verify clear is a no-op
    await cache.clear();
    expect(await cache.get("test-key")).toBeNull();
  });
});

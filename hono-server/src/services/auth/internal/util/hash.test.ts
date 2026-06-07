// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { hashPassword } from "./hash";

describe("hashPassword", () => {
  it("should generate a consistent SHA-256 hex string", async () => {
    const password = "secure-password123";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 output is 64 hex characters (32 bytes)
    // Matches the standard SHA-256 hash of "secure-password123"
    expect(hash1).toBe("d100d60430bb105d9d219c5c1c44b90249b29447134dfffc45589aae59845ae0");
  });

  it("should generate different hashes for different inputs", async () => {
    const hashA = await hashPassword("passwordA");
    const hashB = await hashPassword("passwordB");

    expect(hashA).not.toBe(hashB);
  });
});

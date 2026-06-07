// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { generateToken, verifyToken } from "./jwt";

describe("JWT Utilities", () => {
  const secret = "super-secret-key-123456";
  const userId = "user-uuid-999";
  const email = "test@example.com";

  it("should generate a valid token and verify it correctly", async () => {
    const token = await generateToken({ userId, email }, secret);
    const decoded = await verifyToken(token, secret);

    expect(decoded.sub).toBe(userId);
    expect(decoded.email).toBe(email);
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("should fail validation with an invalid secret", async () => {
    const token = await generateToken({ userId, email }, secret);

    await expect(verifyToken(token, "wrong-secret")).rejects.toThrow();
  });

  it("should reject an expired token", async () => {
    // Generate a token that expired 10 seconds ago
    const token = await generateToken({ userId, email }, secret, -10);

    await expect(verifyToken(token, secret)).rejects.toThrow();
  });
});

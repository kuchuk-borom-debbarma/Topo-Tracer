/**
 * Utility functions for hashing passwords using Web Crypto API.
 * Resides under internal/util/ to keep details private to the auth module.
 */

/**
 * Hashes a plain-text password using SHA-256 and returns a hex string.
 * This is runtime-agnostic and runs perfectly in Node, Bun, and Cloudflare Workers.
 * 
 * @param password - Plain-text password.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

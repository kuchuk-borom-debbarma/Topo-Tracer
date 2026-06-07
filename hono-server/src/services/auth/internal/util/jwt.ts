import { sign, verify } from "hono/jwt";

/**
 * JWT utility functions for generating and validating tokens.
 * Following code-base.md guidelines:
 * - Utility functions specific to the auth module are kept inside internal/util/.
 * - Keeps JWT token signing and verification isolated from the core service class.
 */

export type JWTPayload = {
  sub: string;
  email: string;
  exp: number;
};

/**
 * Generates a signed JWT token containing user details.
 *
 * @param payload.userId - The user ID to include in the payload as 'sub'.
 * @param payload.email - The user email to include.
 * @param secret - Secret key used for signing.
 * @param expiresInSeconds - Token validity duration (default: 24 hours).
 */
export async function generateToken(
  payload: { userId: string; email: string },
  secret: string,
  expiresInSeconds = 24 * 60 * 60,
): Promise<string> {
  const jwtPayload: JWTPayload = {
    sub: payload.userId,
    email: payload.email,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  return await sign(jwtPayload, secret, "HS256");
}

/**
 * Verifies a JWT token and returns its decoded payload.
 *
 * @param token - The token string to verify.
 * @param secret - Secret key used to verify the signature.
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<JWTPayload> {
  return (await verify(token, secret, "HS256")) as JWTPayload;
}

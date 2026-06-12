import { MiddlewareHandler } from "hono";
import { authService } from "../../services/auth";
import { getStringEnvValue } from "../../common/env";
import { TopoTraceException } from "../../common/types";
import { rootLogger } from "../../common/logger";

const logger = rootLogger.getSubLogger({
  name: "JwtAuthMiddleware",
});

/**
 * JWT Authentication middleware.
 * Following code-base.md guidelines:
 * - Decouples route handlers from user lookup orchestration.
 * - Extracts Bearer token or fallback X-API-Key token.
 * - Verifies user identity and validates tenant match on trace operations.
 */
export const jwtAuthMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const apiKey = c.req.header("X-API-Key");

    if (!bearerToken && !apiKey) {
      logger.trace("Authentication failed: No token provided");
      return c.json({ error: "Unauthorized: Missing token in Authorization or X-API-Key header" }, 401);
    }

    try {
      const jwtSecret = getStringEnvValue(c, "JWT_SECRET") || "default-secret-key";
      const user = bearerToken
        ? await authService.getUserByToken({ token: bearerToken, jwtSecret })
        : await authService.getUserByApiKey({ apiKey: apiKey! });

      c.set("userId", user.id);
      c.set("user", user);

      const requestedUserId = c.req.header("X-User-Id");
      if (requestedUserId && requestedUserId !== user.id) {
        logger.warn(`Tenant violation attempt: Auth user="${user.id}" requested user="${requestedUserId}"`);
        return c.json({ error: "Forbidden: Tenant verification failed" }, 403);
      }

      await next();
    } catch (err: any) {
      logger.trace(`Authentication failed: ${err.message}`);
      const status = (err instanceof TopoTraceException ? err.statusCode : 401) as 401 | 403 | 500;
      return c.json({ error: err.message || "Unauthorized" }, status);
    }
  };
};;

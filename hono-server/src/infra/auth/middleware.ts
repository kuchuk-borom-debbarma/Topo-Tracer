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
  // fallow-ignore-next-line complexity
  return async (c, next) => {
    let token: string | undefined;

    // 1. Try standard Authorization header first
    const authHeader = c.req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      // 2. Fall back to X-API-Key for SDK compatibility
      token = c.req.header("X-API-Key");
    }

    if (!token) {
      logger.trace("Authentication failed: No token provided");
      return c.json({ error: "Unauthorized: Missing token in Authorization or X-API-Key header" }, 401);
    }

    const jwtSecret = getStringEnvValue(c, "JWT_SECRET") || "default-secret-key";

    try {
      // 3. Resolve user identity from token
      const user = await authService.getUserByToken({ token, jwtSecret });
      
      // 4. Inject authenticated context into Hono variables
      c.set("userId", user.id);
      c.set("user", user);

      // 5. Multi-Tenant isolation validation
      // If the client explicitly requests a specific user ID in the headers or request body,
      // verify that it matches the authenticated user ID.
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
};

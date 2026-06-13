import { Logger } from "tslog";
import { IAuthService } from "../../api/IAuthService";
import { authRepo } from "../repo";
import { IAuthRepo } from "../repo/IAuthRepo";
import { TopoTraceException } from "../../../../common/types";
import { IExternalNotificationService } from "../../../external-notification/api/IExternalNotificationService";
import { generateToken, verifyToken } from "../util/jwt";
import type { ApiKey, CreatedApiKey, User } from "../../api/types";
import { ICache } from "../../../../infra/cache/api/ICache";
import { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { InternalTracer } from "../../../../infra/tracing/InternalTracer";
import * as crypto from "crypto";

/**
 * Generates a secure, cryptographically random 6-digit numeric OTP.
 */
function generateSecureOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Authentication Service implementation.
 * Following code-base.md guidelines:
 * - Resides under internal/service-impl/ to keep implementation details private.
 * - Owns business orchestration workflows for signing up and logging in users.
 * - Does not contain direct SQL queries, raw database connections, or HTTP formatting.
 * - Leverages dependency injection by constructing sub-loggers from parent loggers.
 */
export class AuthServiceImpl extends IAuthService {
  readonly logger: Logger<unknown>;
  readonly authRepo: IAuthRepo;
  readonly notificationService: IExternalNotificationService;
  readonly cache: ICache;
  readonly eventBus: IEventBus;

  constructor(
    parentLogger: Logger<unknown>,
    notificationService: IExternalNotificationService,
    cache: ICache,
    eventBus: IEventBus,
  ) {
    super();
    // Derives a structured child logger for this component, adhering to the logging rules
    this.logger = parentLogger.getSubLogger({
      name: "AuthServiceImpl",
    });
    this.authRepo = authRepo;
    this.notificationService = notificationService;
    this.cache = cache;
    this.eventBus = eventBus;
  }

  /**
   * Phase 1 of User Sign Up:
   * Creates a pending signup state in the database, generates a verification code (OTP),
   * and returns the confirmation token identifier.
   */
  // fallow-ignore-next-line unused-class-member
  async startSignUp(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<string> {
    // SECURITY WARNING: In compliance with code-base.md, do not log passwords or sensitive inputs.
    // Only log safe metadata (username and email).
    this.logger.trace(`startSignUp initiated for username="${data.username}", email="${data.email}"`);
    try {
      const store = InternalTracer.getStore();
      const traceId = store?.traceId;
      const parentSpanId = store?.spanId;

      return await InternalTracer.trace(
        "authService.startSignUp",
        async () => {
          const tokenId = await this.authRepo.transaction(async (tx) => {
            // 1. Write the pending user record to register intent with trace context
            const inserted = await this.authRepo.insertPendingSignUpUser({
              ...data,
              traceId,
              parentSpanId,
            }, tx);

            // 2. Generate a verification code OTP linked to the pending user token
            const tokenOTP = await this.authRepo.upsertUserTokenOTP({
              token: inserted.id,
              otp: generateSecureOTP(),
            }, tx);

            // 3. Publish signup event to trigger async email notification
            await this.eventBus.publish(
              [
                {
                  topic: "auth.signup.started",
                  idempotencyId: `auth.signup.started:${inserted.id}`,
                  key: inserted.id,
                  data: {
                    email: data.email,
                    otp: tokenOTP.otp,
                  },
                },
              ],
              { tx },
            );

            return tokenOTP.id;
          });

          return tokenId;
        },
        { type: "auth", importanceLevel: 0 }
      );
    } catch (err) {
      this.logger.error("Failed to start signup process", err);
      throw err;
    }
  }

  /**
   * Phase 2 of User Sign Up:
   * Validates the verification code (OTP) against the pending registration token.
   * If correct, promotes the pending record into a fully registered user.
   */
  // fallow-ignore-next-line unused-class-member
  async finishSignUp(data: { token: string; otp: string }): Promise<void> {
    // SECURITY WARNING: In compliance with code-base.md, redact OTP/credentials in trace logs.
    this.logger.trace(`finishSignUp verification initiated for token="${data.token}"`);
    try {
      await InternalTracer.trace(
        "authService.finishSignUp",
        async () => {
          // 1. Retrieve the verification code state from the repository
          const tokenOtp = await this.authRepo.getTokenOTPById(data.token);

          // 2. Validate OTP. Throws TopoTraceException (403) on mismatches
          if (tokenOtp.otp !== data.otp) {
            throw new TopoTraceException("OTP Mismatch", 403);
          }

          // 3. Retrieve the pending user metadata
          const user = await this.authRepo.getPendingUserById(tokenOtp.token);

          if (user.traceId) {
            const store = InternalTracer.getStore();
            if (store) {
              const nestedContext = {
                traceId: user.traceId,
                spanId: user.parentSpanId || store.spanId,
                parentSpanId: undefined,
                spansBuffer: store.spansBuffer,
              };

              await InternalTracer.run(nestedContext, async () => {
                await InternalTracer.trace(
                  "authService.promoteUser",
                  async () => {
                    // 4. Promote and persist the user as fully active under original trace T1
                    await this.authRepo.insertUser({
                      email: user.email,
                      password: user.hashedPassword,
                      username: user.username,
                      isPasswordHashed: true,
                    });
                  },
                  { type: "auth", importanceLevel: 0 }
                );
              });
              return;
            }
          }

          // 4. Fallback: Promote and persist the user as fully active
          await this.authRepo.insertUser({
            email: user.email,
            password: user.hashedPassword,
            username: user.username,
            isPasswordHashed: true,
          });
        },
        { type: "auth", importanceLevel: 0 }
      );
    } catch (err) {
      this.logger.error("Failed to finish signup verification", err);
      throw err;
    }
  }

  /**
   * User Sign In Flow:
   * Verifies the user credentials and generates a JWT authorization token.
   */
  // fallow-ignore-next-line unused-class-member
  async getAuthToken(data: {
    email: string;
    password: string;
    jwtSecret: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    // SECURITY WARNING: In compliance with code-base.md, do not log credentials/passwords.
    this.logger.trace(`getAuthToken login attempt for email="${data.email}"`);
    const { email, password, jwtSecret, expiresInSeconds } = data;
    try {
      // 1. Fetch user matching email and verify credential match
      const user = await this.authRepo.getUserByFilter({
        email,
        password,
      });

      // 2. Generate and sign the JWT access token using the utility
      const token = await generateToken(
        { userId: user.id, email: user.email, authVersion: user.authVersion },
        jwtSecret,
        expiresInSeconds,
      );

      return token;
    } catch (err) {
      this.logger.error("Failed to acquire authentication token", err);
      throw err;
    }
  }

  /**
   * Initiates the password reset flow.
   * Looks up the user by email, inserts a new PASSWORD_RESET token, and generates an OTP.
   */
  // fallow-ignore-next-line unused-class-member
  async startResetPassword(data: { email: string }): Promise<string> {
    // SECURITY WARNING: In compliance with code-base.md, only log non-sensitive identifier (email)
    this.logger.trace(`startResetPassword initiated for email="${data.email}"`);
    try {
      // 1. Lookup user by email filter
      const user = await this.authRepo.getUserByFilter({ email: data.email });
      if (!user) {
        throw new TopoTraceException("User not found", 404);
      }

      // 2. Insert new TokenOTP entry (allowing multiple active reset tokens as per design to avoid overwrite spam)
      const tokenOTP = await this.authRepo.insertUserTokenOTP({
        token: user.id,
        otp: generateSecureOTP(),
        tokenType: "PASSWORD_RESET",
      });

      // 3. Dispatch OTP notification to user
      await this.notificationService.sendNotification({
        recipient: data.email,
        subject: "Reset your TopoTracer password",
        body: `Your password reset OTP code is: ${tokenOTP.otp}`,
      });

      return tokenOTP.id;
    } catch (err) {
      this.logger.error("Failed to start password reset flow", err);
      throw err;
    }
  }

  /**
   * Finalizes the password reset flow.
   * Verifies the OTP, updates the user's password, and deletes all user's reset tokens.
   */
  // fallow-ignore-next-line unused-class-member
  async finishResetPassword(data: {
    token: string;
    otp: string;
    newPassword: string;
  }): Promise<void> {
    // SECURITY WARNING: In compliance with code-base.md, do not log OTP or newPassword.
    this.logger.trace(`finishResetPassword verification initiated for token="${data.token}"`);
    try {
      // 1. Fetch the TokenOTP record
      const tokenOtp = await this.authRepo.getTokenOTPById(data.token);

      // 2. Validate token type and OTP value
      if (tokenOtp.tokenType !== "PASSWORD_RESET") {
        throw new TopoTraceException("Invalid token type", 400);
      }
      if (tokenOtp.otp !== data.otp) {
        throw new TopoTraceException("OTP Mismatch", 403);
      }

      // 3. Fetch user associated with this token
      const user = await this.authRepo.getUserById(tokenOtp.token);

      // 4. Update the user password in repository
      await this.authRepo.updateUserPassword({
        userId: user.id,
        password: data.newPassword,
      });

      // 5. Clean up all password reset tokens associated with this user
      await this.authRepo.deleteUserTokenOTPs({
        token: user.id,
        tokenType: "PASSWORD_RESET",
      });

      // 6. Invalidate user cache entry to reflect security change
      await this.cache.delete(`user:id:${user.id}`);
    } catch (err) {
      this.logger.error("Failed to finish password reset flow", err);
      throw err;
    }
  }

  /**
   * Retrieves the user profile associated with a valid JWT token.
   * Decodes and verifies the token signature before performing database lookup.
   */
  // fallow-ignore-next-line unused-class-member
  async getUserByToken(data: {
    token: string;
    jwtSecret: string;
  }): Promise<User> {
    this.logger.trace("getUserByToken initiated");
    const { token, jwtSecret } = data;
    try {
      // 1. Verify the JWT token and decode its payload
      const payload = await verifyToken(token, jwtSecret);

      // 2. Try to retrieve user from cache
      const cacheKey = `user:id:${payload.sub}`;
      const cachedUser = await this.cache.get<User>(cacheKey);
      
      let user: User;
      if (cachedUser) {
        this.logger.trace(`getUserByToken cache hit for userId="${payload.sub}"`);
        user = cachedUser;
      } else {
        // 3. Fetch from repository if cache miss
        user = await this.authRepo.getUserById(payload.sub);
        // 4. Populate cache with a 1-hour TTL
        await this.cache.set(cacheKey, user, 3600);
      }

      // 5. Security version check: Invalidate token if user's authVersion has been bumped
      if (payload.authVersion < user.authVersion) {
        this.logger.warn(`getUserByToken security version mismatch for userId="${user.id}": token_v=${payload.authVersion}, user_v=${user.authVersion}`);
        throw new TopoTraceException("Invalid or expired token", 401);
      }

      return user;
    } catch (err) {
      this.logger.error("Failed to authenticate user by token", err);
      // Map verification failures to standard 401 Unauthorized exceptions
      throw new TopoTraceException("Invalid or expired token", 401);
    }
  }

  async getUserByApiKey(data: { apiKey: string }): Promise<User> {
    const keyHash = this.hashApiKey(data.apiKey);
    const user = await this.authRepo.getUserByApiKeyHash(keyHash);
    if (!user) {
      throw new TopoTraceException("Invalid API key", 401);
    }
    return user;
  }

  async createApiKey(data: { userId: string; name: string }): Promise<CreatedApiKey> {
    const name = data.name.trim();
    if (!name) {
      throw new TopoTraceException("API key name is required", 400);
    }

    const key = `tt_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = this.hashApiKey(key);
    const row = await this.authRepo.insertApiKey({
      userId: data.userId,
      name,
      keyHash,
      keyPrefix: key.slice(0, 10),
    });

    return {
      ...this.mapApiKey(row),
      key,
    };
  }

  async listApiKeys(data: { userId: string }): Promise<ApiKey[]> {
    const rows = await this.authRepo.listApiKeys(data.userId);
    return rows.map((row) => this.mapApiKey(row));
  }

  async revokeApiKey(data: { userId: string; apiKeyId: string }): Promise<void> {
    await this.authRepo.revokeApiKey(data);
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
  }

  private mapApiKey(row: { id: string; name: string; keyPrefix: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }): ApiKey {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
    };
  }
}


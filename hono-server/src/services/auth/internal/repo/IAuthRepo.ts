import { User } from "../../api/types";
import { PendingUser, TokenOTP } from "./types";

/**
 * Interface contract for the Authentication Repository.
 * Defines the persistence operations needed by the auth service.
 * Following code-base.md guidelines:
 * - Kept under internal/repo to prevent leaking implementation choices to the outer services/routes.
 * - Decouples business logic from specific database clients.
 * - Handles mapping of database rows to internal type definitions.
 */
export abstract class IAuthRepo {
  /**
   * Retrieves a registered user matching the given filter (e.g. email or password check).
   * 
   * @param filters.email - Optional email filter.
   * @param filters.password - Optional password filter.
   * @returns The matched User object.
   */
  abstract getUserByFilter(filters: {
    email?: string;
    password?: string;
  }): Promise<User>;

  /**
   * Creates a new fully registered user record.
   * 
   * @param data.username - Chosen username.
   * @param data.email - User email.
   * @param data.password - Password to store.
   * @param data.isPasswordHashed - Flag indicating if password is pre-hashed.
   * @returns The newly created User object.
   */
  abstract insertUser(data: {
    username: string;
    email: string;
    password: string;
    isPasswordHashed?: boolean;
  }): Promise<User>;

  /**
   * Inserts a pending signup user record. Used for the two-step verification flow.
   * 
   * @param data.username - Chosen username.
   * @param data.email - User email.
   * @param data.password - Password to store.
   * @returns The created PendingUser object containing the signup state.
   */
  abstract insertPendingSignUpUser(
    data: {
      username: string;
      email: string;
      password: string;
    },
    tx?: any,
  ): Promise<PendingUser>;

  /**
   * Retrieves the pending user signup details by the signup token ID.
   * 
   * @param token - The signup token/ID.
   * @returns The PendingUser signup state.
   */
  abstract getPendingUserById(token: string): Promise<PendingUser>;

  /**
   * Creates or updates a Token OTP verification record for a user signup flow.
   * 
   * @param data.otp - The one-time password code.
   * @param data.token - The associated signup token ID.
   * @returns The created/updated TokenOTP record.
   */
  abstract upsertUserTokenOTP(
    data: {
      otp: string;
      token: string;
    },
    tx?: any,
  ): Promise<TokenOTP>;

  /**
   * Fetches the Token OTP record using the token ID.
   * 
   * @param token - The token ID.
   * @returns The matching TokenOTP record.
   */
  abstract getTokenOTPById(token: string): Promise<TokenOTP>;

  /**
   * Fetches a fully registered user by their ID.
   * 
   * @param token - User ID.
   * @returns The User record.
   */
  abstract getUserById(token: string): Promise<User>;

  /**
   * Updates a user's password in the database.
   * 
   * @param data.userId - User ID.
   * @param data.password - The hashed new password.
   */
  abstract updateUserPassword(data: {
    userId: string;
    password: string;
  }): Promise<void>;

  /**
   * Inserts a new Token OTP verification record (allows multiple active entries).
   * 
   * @param data.otp - The one-time password code.
   * @param data.token - The associated user/signup token ID.
   * @param data.tokenType - The token classification.
   * @returns The newly created TokenOTP record.
   */
  abstract insertUserTokenOTP(data: {
    otp: string;
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<TokenOTP>;

  /**
   * Deletes all Token OTP records matching the given token reference and type.
   * Used for cleanup after successful verification.
   * 
   * @param data.token - The associated token/user ID reference to delete.
   * @param data.tokenType - The token classification to clean up.
   */
  abstract deleteUserTokenOTPs(data: {
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<void>;

  /**
   * Executes database operations inside a PostgreSQL transaction context.
   */
  abstract transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}



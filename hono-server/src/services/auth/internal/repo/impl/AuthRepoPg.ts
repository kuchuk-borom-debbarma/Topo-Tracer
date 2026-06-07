import { User } from "../../../api/types";
import { IAuthRepo } from "../IAuthRepo";
import { PendingUser, TokenOTP } from "../types";

/**
 * PostgreSQL implementation of the Auth Repository contract.
 * Following code-base.md guidelines:
 * - This class resides in internal/repo/impl.
 * - It inherits from the abstract IAuthRepo contract.
 * - Responsible for mapping PostgreSQL tables/rows to the service module's internal types.
 * - Currently structured as a placeholder/stub to be backed by a PG client later.
 */
export class AuthRepoPg extends IAuthRepo {
  /**
   * Retrieves a user matching the provided filters.
   * Will execute SQL select against the users table.
   */
  getUserByFilter(filters: {
    email?: string;
    password?: string;
  }): Promise<User> {
    throw new Error("Method not implemented.");
  }

  /**
   * Inserts a fully active user record.
   * Will execute an insert into the users table.
   */
  insertUser(data: {
    username: string;
    email: string;
    password: string;
    isPasswordHashed?: boolean;
  }): Promise<User> {
    throw new Error("Method not implemented.");
  }

  /**
   * Inserts a temporary pending signup record.
   * Will execute an insert into the pending_users table.
   */
  insertPendingSignUpUser(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<PendingUser> {
    throw new Error("Method not implemented.");
  }

  /**
   * Finds a pending signup record by its primary token ID.
   */
  getPendingUserById(token: string): Promise<PendingUser> {
    throw new Error("Method not implemented.");
  }

  /**
   * Upserts the OTP verification code and token binding.
   * Will execute SQL upsert on token_otps table.
   */
  upsertUserTokenOTP(data: {
    otp: string;
    token: string;
  }): Promise<TokenOTP> {
    throw new Error("Method not implemented.");
  }

  /**
   * Finds verification code state by token ID.
   */
  getTokenOTPById(token: string): Promise<TokenOTP> {
    throw new Error("Method not implemented.");
  }

  /**
   * Retrieves a fully registered user by their ID.
   */
  getUserById(token: string): Promise<User> {
    throw new Error("Method not implemented.");
  }

  /**
   * Updates a user's password in the database.
   */
  updateUserPassword(data: {
    userId: string;
    password: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  /**
   * Inserts a new Token OTP verification record.
   */
  insertUserTokenOTP(data: {
    otp: string;
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<TokenOTP> {
    throw new Error("Method not implemented.");
  }

  /**
   * Deletes all Token OTP records matching the given token reference and type.
   */
  deleteUserTokenOTPs(data: {
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }
}



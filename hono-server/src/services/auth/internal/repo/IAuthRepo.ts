import type { User } from "../../api/types";
import type { ApiKeyRow, PendingUser, TokenOTP } from "./types";

export abstract class IAuthRepo {
  abstract getUserByFilter(filters: {
    email?: string;
    password?: string;
  }): Promise<User>;

  abstract getUserById(userId: string): Promise<User>;

  abstract getPendingUserById(token: string): Promise<PendingUser>;

  abstract insertPendingSignUpUser(data: {
    username: string;
    email: string;
    password: string;
    traceId?: string;
    parentSpanId?: string;
  }, tx?: unknown): Promise<PendingUser>;

  abstract insertUser(data: {
    username: string;
    email: string;
    password: string;
    isPasswordHashed?: boolean;
  }, tx?: unknown): Promise<User>;

  abstract upsertUserTokenOTP(
    data: {
      token: string;
      otp: string;
    },
    tx?: unknown,
  ): Promise<TokenOTP>;

  abstract insertUserTokenOTP(data: {
    token: string;
    otp: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<TokenOTP>;

  abstract getTokenOTPById(token: string): Promise<TokenOTP>;

  abstract updateUserPassword(data: {
    userId: string;
    password: string;
  }): Promise<void>;

  abstract deleteUserTokenOTPs(data: {
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<void>;

  abstract insertApiKey(data: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
  }): Promise<ApiKeyRow>;

  abstract listApiKeys(userId: string): Promise<ApiKeyRow[]>;

  abstract revokeApiKey(data: {
    userId: string;
    apiKeyId: string;
  }): Promise<void>;

  abstract getUserByApiKeyHash(keyHash: string): Promise<User | null>;

  abstract markApiKeyUsed(apiKeyId: string): Promise<void>;

  abstract transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export default IAuthRepo;

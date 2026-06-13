import type { ApiKey, CreatedApiKey, User } from "./types";

export abstract class IAuthService {
  abstract startSignUp(data: {
    username: string;
    email: string;
    password: string;
    traceId?: string;
    parentSpanId?: string;
  }): Promise<string>;

  abstract finishSignUp(data: {
    token: string;
    otp: string;
  }): Promise<void>;

  abstract getAuthToken(data: {
    email: string;
    password: string;
    jwtSecret: string;
    expiresInSeconds?: number;
  }): Promise<string>;

  abstract startResetPassword(data: {
    email: string;
  }): Promise<string>;

  abstract finishResetPassword(data: {
    token: string;
    otp: string;
    newPassword: string;
  }): Promise<void>;

  abstract getUserByToken(data: {
    token: string;
    jwtSecret: string;
  }): Promise<User>;

  abstract getUserByApiKey(data: {
    apiKey: string;
  }): Promise<User>;

  abstract createApiKey(data: {
    userId: string;
    name: string;
  }): Promise<CreatedApiKey>;

  abstract listApiKeys(data: {
    userId: string;
  }): Promise<ApiKey[]>;

  abstract revokeApiKey(data: {
    userId: string;
    apiKeyId: string;
  }): Promise<void>;
}


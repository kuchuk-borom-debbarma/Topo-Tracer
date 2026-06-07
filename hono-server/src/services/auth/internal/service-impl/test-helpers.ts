// fallow-ignore-file
import { mock } from "bun:test";
import { Logger } from "tslog";
import { AuthServiceImpl } from "./AuthServiceImpl";
import { IAuthRepo } from "../repo/IAuthRepo";
import { IExternalNotificationService } from "../../../external-notification/api/IExternalNotificationService";
import { InMemoryCache } from "../../../../infra/cache/internal/InMemoryCache";
import { User } from "../../api/types";
import { PendingUser, TokenOTP } from "../repo/types";

export const mockLogger = new Logger({ name: "AuthServiceImplTest", type: "hidden" });
export const jwtSecret = "my-secret-key-9876";

export class MockAuthRepo extends IAuthRepo {
  getUserByFilter = mock(async (filters: any): Promise<User> => {
    throw new Error("Not implemented");
  });
  insertUser = mock(async (data: any): Promise<User> => {
    throw new Error("Not implemented");
  });
  insertPendingSignUpUser = mock(async (data: any): Promise<PendingUser> => {
    throw new Error("Not implemented");
  });
  getPendingUserById = mock(async (token: string): Promise<PendingUser> => {
    throw new Error("Not implemented");
  });
  upsertUserTokenOTP = mock(async (data: any): Promise<TokenOTP> => {
    throw new Error("Not implemented");
  });
  getTokenOTPById = mock(async (token: string): Promise<TokenOTP> => {
    throw new Error("Not implemented");
  });
  getUserById = mock(async (token: string): Promise<User> => {
    throw new Error("Not implemented");
  });
  updateUserPassword = mock(async (data: any): Promise<void> => {});
  insertUserTokenOTP = mock(async (data: any): Promise<TokenOTP> => {
    throw new Error("Not implemented");
  });
  deleteUserTokenOTPs = mock(async (data: any): Promise<void> => {});
}

export class MockNotificationService extends IExternalNotificationService {
  sendNotification = mock(async (data: any): Promise<void> => {});
}

export function mockUser(id = "user-789"): User {
  return {
    id,
    username: "userA",
    email: "userA@test.com",
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  };
}

export function mockPending(id = "pending-123"): PendingUser {
  return {
    id,
    username: "userA",
    email: "userA@test.com",
    hashedPassword: "hashed_password",
  };
}

export function mockTokenOtp(id = "token-otp-456", token = "pending-123", tokenType: TokenOTP["tokenType"] = "USER_SIGNUP"): TokenOTP {
  return {
    id,
    token,
    otp: "12345",
    tokenType,
  };
}

export function createService() {
  const repo = new MockAuthRepo();
  const notification = new MockNotificationService();
  const cache = new InMemoryCache();
  const service = new AuthServiceImpl(mockLogger, notification, cache);
  (service as any).authRepo = repo;
  return { service, repo, notification, cache };
}

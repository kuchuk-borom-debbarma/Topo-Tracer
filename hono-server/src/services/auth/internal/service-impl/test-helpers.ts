// fallow-ignore-file
import { mock } from "bun:test";
import { Logger } from "tslog";
import { AuthServiceImpl } from "./AuthServiceImpl";
import { IAuthRepo } from "../repo/IAuthRepo";
import { IExternalNotificationService } from "../../../external-notification/api/IExternalNotificationService";
import { InMemoryCache } from "../../../../infra/cache/internal/InMemoryCache";
import { User } from "../../api/types";
import { PendingUser, TokenOTP } from "../repo/types";
import { IEventBus } from "../../../../infra/event-bus/api/IEventBus";

export class MockEventBus extends IEventBus {
  publish = mock(async () => {});
  subscribe = mock(async () => {});
}

export const mockLogger = new Logger({ name: "AuthServiceImplTest", type: "hidden" });
export const jwtSecret = "my-secret-key-9876";

export class MockAuthRepo extends IAuthRepo {
  transaction = mock(async (fn: any) => fn(this));

  getUserByFilter = mock(async () => mockUser());
  insertUser = mock(async () => mockUser());
  insertPendingSignUpUser = mock(async () => mockPending());
  getPendingUserById = mock(async () => mockPending());
  upsertUserTokenOTP = mock(async () => mockTokenOtp());
  getTokenOTPById = mock(async () => mockTokenOtp());
  getUserById = mock(async () => mockUser());
  updateUserPassword = mock(async () => {});
  insertUserTokenOTP = mock(async () => mockTokenOtp());
  deleteUserTokenOTPs = mock(async () => {});
  insertApiKey = mock(async (data: any) => ({
    id: "api-key-1",
    userId: data.userId,
    name: data.name,
    keyHash: data.keyHash,
    keyPrefix: data.keyPrefix,
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  }));
  listApiKeys = mock(async () => []);
  revokeApiKey = mock(async () => {});
  getUserByApiKeyHash = mock(async () => null);
  markApiKeyUsed = mock(async () => {});
}

export class MockNotificationService extends IExternalNotificationService {
  sendNotification = mock(async (data: any): Promise<void> => {});
}

export function mockUser(id = "user-789"): User {
  return {
    id,
    username: "userA",
    email: "userA@test.com",
    authVersion: 1,
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

export function createService(eventBus?: any) {
  const repo = new MockAuthRepo();
  const notification = new MockNotificationService();
  const cache = new InMemoryCache();
  const bus = eventBus ?? new MockEventBus();
  const service = new AuthServiceImpl(mockLogger, notification, cache, bus);
  (service as any).authRepo = repo;
  return { service, repo, notification, cache, eventBus: bus };
}

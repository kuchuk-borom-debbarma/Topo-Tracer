// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { AuthRepoPg } from "./AuthRepoPg";

const mockSql = mock((strings: TemplateStringsArray, ...values: any[]) => {
  return Promise.resolve([]);
});

(mock as any).module("../../../../../infra/db", () => {
  return {
    postgres: {
      getInitializedPostgresClient: () => mockSql,
    },
  };
});

describe("AuthRepoPg - Signup OTPs", () => {
  it("should upsert user token OTP", async () => {
    const repo = new AuthRepoPg();
    const mockOtpRow = {
      id: "token-123",
      token: "token-123",
      otp: "12345",
      tokenType: "USER_SIGNUP",
    };
    (mockSql as any).mockResolvedValueOnce([mockOtpRow]);

    const tokenOtp = await repo.upsertUserTokenOTP({
      otp: "12345",
      token: "token-123",
    });

    expect(tokenOtp.id).toBe("token-123");
    expect(tokenOtp.otp).toBe("12345");
  });

  it("should get token OTP by ID", async () => {
    const repo = new AuthRepoPg();
    const mockOtpRow = {
      id: "token-123",
      token: "token-123",
      otp: "12345",
      tokenType: "USER_SIGNUP",
    };
    (mockSql as any).mockResolvedValueOnce([mockOtpRow]);

    const tokenOtp = await repo.getTokenOTPById("token-123");

    expect(tokenOtp.id).toBe("token-123");
    expect(tokenOtp.otp).toBe("12345");
  });
});

describe("AuthRepoPg - Password Reset OTPs", () => {
  it("should insert user token OTP", async () => {
    const repo = new AuthRepoPg();
    const mockOtpRow = {
      id: "otp-uuid",
      token: "u-123",
      otp: "67890",
      tokenType: "PASSWORD_RESET",
    };
    (mockSql as any).mockResolvedValueOnce([mockOtpRow]);

    const tokenOtp = await repo.insertUserTokenOTP({
      otp: "67890",
      token: "u-123",
      tokenType: "PASSWORD_RESET",
    });

    expect(tokenOtp.token).toBe("u-123");
    expect(tokenOtp.otp).toBe("67890");
    expect(tokenOtp.tokenType).toBe("PASSWORD_RESET");
  });

  it("should delete user token OTPs", async () => {
    const repo = new AuthRepoPg();
    (mockSql as any).mockResolvedValueOnce([]);

    await repo.deleteUserTokenOTPs({
      token: "u-123",
      tokenType: "PASSWORD_RESET",
    });

    expect(mockSql).toHaveBeenCalled();
  });
});

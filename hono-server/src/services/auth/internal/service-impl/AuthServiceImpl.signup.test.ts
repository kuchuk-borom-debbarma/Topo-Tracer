// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { createService, mockPending, mockTokenOtp, mockUser } from "./test-helpers";

describe("AuthServiceImpl - SignUp Flow", () => {
  it("should orchestrate startSignUp correctly", async () => {
    const { service, repo, notification, eventBus } = createService();

    (repo.insertPendingSignUpUser as any).mockResolvedValue(mockPending("pending-123"));
    (repo.upsertUserTokenOTP as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "USER_SIGNUP"));

    const tokenOtpId = await service.startSignUp({
      username: "userA",
      email: "userA@test.com",
      password: "password123",
    });

    expect(tokenOtpId).toBe("token-otp-456");
    expect(repo.insertPendingSignUpUser).toHaveBeenCalledWith(
      {
        username: "userA",
        email: "userA@test.com",
        password: "password123",
      },
      repo,
    );
    expect(repo.upsertUserTokenOTP).toHaveBeenCalledWith(
      {
        token: "pending-123",
        otp: "12345",
      },
      repo,
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      [
        {
          topic: "auth.signup.started",
          idempotencyId: "auth.signup.started:pending-123",
          key: "pending-123",
          data: {
            email: "userA@test.com",
            otp: "12345",
          },
        },
      ],
      { tx: repo },
    );
    expect(notification.sendNotification).not.toHaveBeenCalled();
  });

  it("should finishSignUp when OTP is correct", async () => {
    const { service, repo } = createService();

    (repo.getTokenOTPById as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "USER_SIGNUP"));
    (repo.getPendingUserById as any).mockResolvedValue(mockPending("pending-123"));
    (repo.insertUser as any).mockResolvedValue(mockUser("user-789"));

    await service.finishSignUp({ token: "token-otp-456", otp: "12345" });

    expect(repo.getTokenOTPById).toHaveBeenCalledWith("token-otp-456");
    expect(repo.getPendingUserById).toHaveBeenCalledWith("pending-123");
    expect(repo.insertUser).toHaveBeenCalledWith({
      username: "userA",
      email: "userA@test.com",
      password: "hashed_password",
      isPasswordHashed: true,
    });
  });

  it("should throw on finishSignUp if OTP mismatches", async () => {
    const { service, repo } = createService();

    (repo.getTokenOTPById as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "USER_SIGNUP"));

    await expect(
      service.finishSignUp({ token: "token-otp-456", otp: "wrong-otp" })
    ).rejects.toThrow("OTP Mismatch");
  });
});

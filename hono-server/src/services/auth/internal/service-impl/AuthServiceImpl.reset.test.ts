// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { createService, mockTokenOtp, mockUser } from "./test-helpers";

describe("AuthServiceImpl - Password Reset Flow", () => {
  it("should orchestrate password reset process correctly", async () => {
    const { service, repo, notification, cache } = createService();

    (repo.getUserByFilter as any).mockResolvedValue(mockUser("user-789"));
    (repo.insertUserTokenOTP as any).mockResolvedValue(mockTokenOtp("reset-token-otp", "user-789", "PASSWORD_RESET"));
    (repo.getTokenOTPById as any).mockResolvedValue(mockTokenOtp("reset-token-otp", "user-789", "PASSWORD_RESET"));
    (repo.getUserById as any).mockResolvedValue(mockUser("user-789"));

    // 1. Start password reset
    const token = await service.startResetPassword({ email: "userA@test.com" });
    expect(token).toBe("reset-token-otp");
    expect(repo.insertUserTokenOTP).toHaveBeenCalledWith({
      token: "user-789",
      otp: "12345",
      tokenType: "PASSWORD_RESET",
    });
    expect(notification.sendNotification).toHaveBeenCalledWith({
      recipient: "userA@test.com",
      subject: "Reset your TopoTracer password",
      body: "Your password reset OTP code is: 12345",
    });

    // 2. Mock a cached user lookup to ensure cache eviction works
    await cache.set("user:id:user-789", mockUser("user-789"));

    // 3. Finish password reset
    await service.finishResetPassword({
      token: "reset-token-otp",
      otp: "12345",
      newPassword: "new-password-abc",
    });

    expect(repo.updateUserPassword).toHaveBeenCalledWith({
      userId: "user-789",
      password: "new-password-abc",
    });
    expect(repo.deleteUserTokenOTPs).toHaveBeenCalledWith({
      token: "user-789",
      tokenType: "PASSWORD_RESET",
    });
    // Cache entry must be evicted
    expect(await cache.get("user:id:user-789")).toBeNull();
  });
});

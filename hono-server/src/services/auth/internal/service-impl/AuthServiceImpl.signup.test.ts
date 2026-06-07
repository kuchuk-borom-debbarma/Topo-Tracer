// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { createService, mockPending, mockTokenOtp, mockUser } from "./test-helpers";

describe("AuthServiceImpl - SignUp Flow", () => {
  it("should orchestrate startSignUp correctly", async () => {
    const { service, repo, notification } = createService();

    (repo.insertPendingSignUpUser as any).mockResolvedValue(mockPending("pending-123"));
    (repo.upsertUserTokenOTP as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "SIGN_UP"));

    const tokenOtpId = await service.startSignUp({
      username: "userA",
      email: "userA@test.com",
      password: "password123",
    });

    expect(tokenOtpId).toBe("token-otp-456");
    expect(repo.insertPendingSignUpUser).toHaveBeenCalledWith({
      username: "userA",
      email: "userA@test.com",
      password: "password123",
    });
    expect(repo.upsertUserTokenOTP).toHaveBeenCalledWith({
      token: "pending-123",
      otp: "12345",
    });
    expect(notification.sendNotification).toHaveBeenCalledWith({
      recipient: "userA@test.com",
      subject: "Verify your TopoTracer registration",
      body: "Your verification OTP code is: 12345",
    });
  });

  it("should finishSignUp when OTP is correct", async () => {
    const { service, repo } = createService();

    (repo.getTokenOTPById as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "SIGN_UP"));
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

    (repo.getTokenOTPById as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "SIGN_UP"));

    await expect(
      service.finishSignUp({ token: "token-otp-456", otp: "wrong-otp" })
    ).rejects.toThrow("OTP Mismatch");
  });
});

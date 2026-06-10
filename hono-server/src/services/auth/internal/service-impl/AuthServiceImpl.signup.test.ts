// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { createService, mockPending, mockTokenOtp, mockUser } from "./test-helpers";
import { InternalTracer } from "../../../../infra/tracing/InternalTracer";
import { hexToUuid, spanIdToUuid } from "../../../../infra/tracing/context";

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

  it("should rollback transaction and not publish event if user insertion fails", async () => {
    const { service, repo, eventBus } = createService();

    (repo.insertPendingSignUpUser as any).mockRejectedValue(new Error("Database write failure"));

    await expect(
      service.startSignUp({
        username: "userA",
        email: "userA@test.com",
        password: "password123",
      })
    ).rejects.toThrow("Database write failure");

    expect(repo.upsertUserTokenOTP).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
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

  it("should propagate active trace parent traceId and spanId to insertPendingSignUpUser during startSignUp", async () => {
    const { service, repo } = createService();

    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const spanId = "06fe605c426d45dd";
    const spansBuffer = { nodeStarts: [], nodeEnds: [], edgeStarts: [], edgeEnds: [] };
    
    (repo.insertPendingSignUpUser as any).mockResolvedValue(mockPending("pending-123"));
    (repo.upsertUserTokenOTP as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "USER_SIGNUP"));

    const tokenOtpId = await InternalTracer.run({
      traceId,
      spanId,
      spansBuffer,
    }, () => service.startSignUp({
      username: "userA",
      email: "userA@test.com",
      password: "password123",
    }));

    expect(tokenOtpId).toBe("token-otp-456");
    expect(repo.insertPendingSignUpUser).toHaveBeenCalledWith(
      {
        username: "userA",
        email: "userA@test.com",
        password: "password123",
        traceId,
        parentSpanId: spanId,
      },
      repo,
    );
  });

  it("should restore trace context and nest user promotion when pending user has traceId during finishSignUp", async () => {
    const { service, repo } = createService();

    const originalTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const originalSpanId = "06fe605c426d45dd";
    
    const pendingWithTrace: any = {
      id: "pending-123",
      username: "userA",
      email: "userA@test.com",
      hashedPassword: "hashed_password",
      traceId: originalTraceId,
      parentSpanId: originalSpanId,
    };

    (repo.getTokenOTPById as any).mockResolvedValue(mockTokenOtp("token-otp-456", "pending-123", "USER_SIGNUP"));
    (repo.getPendingUserById as any).mockResolvedValue(pendingWithTrace);
    (repo.insertUser as any).mockResolvedValue(mockUser("user-789"));

    const currentTraceId = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const currentSpanId = "1122334455667788";
    const spansBuffer = { nodeStarts: [], nodeEnds: [], edgeStarts: [], edgeEnds: [] };

    await InternalTracer.run({
      traceId: currentTraceId,
      spanId: currentSpanId,
      spansBuffer,
    }, () => service.finishSignUp({ token: "token-otp-456", otp: "12345" }));

    expect(repo.getTokenOTPById).toHaveBeenCalledWith("token-otp-456");
    expect(repo.getPendingUserById).toHaveBeenCalledWith("pending-123");
    
    // Check that promoteUser span is recorded in the buffer under the original traceId
    const startNode = spansBuffer.nodeStarts.find(n => n.startMessage === "authService.promoteUser");
    expect(startNode).toBeDefined();
    expect(startNode.traceId).toBe(hexToUuid(originalTraceId));
    
    // And verify edge references original span S1 as parent!
    const edge = spansBuffer.edgeStarts.find(e => e.toNodeId === startNode.id);
    expect(edge).toBeDefined();
    expect(edge.fromNodeId).toBe(spanIdToUuid(originalSpanId));
  });
});

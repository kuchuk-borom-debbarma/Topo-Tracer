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

describe("AuthRepoPg - Pending Users", () => {
  it("should insert pending sign up user", async () => {
    const repo = new AuthRepoPg();
    const mockPendingRow = {
      id: "p-new",
      username: "pendingUser",
      email: "pending@test.com",
      password: "hashed_password",
    };
    (mockSql as any).mockResolvedValueOnce([mockPendingRow]);

    const pending = await repo.insertPendingSignUpUser({
      username: "pendingUser",
      email: "pending@test.com",
      password: "password789",
    });

    expect(pending.id).toBe("p-new");
    expect(pending.username).toBe("pendingUser");
    expect(pending.email).toBe("pending@test.com");
    expect(pending.hashedPassword).toBe("hashed_password");
  });

  it("should get pending user by ID", async () => {
    const repo = new AuthRepoPg();
    const mockPendingRow = {
      id: "p-123",
      username: "pendingUser",
      email: "pending@test.com",
      password: "hashed_password",
    };
    (mockSql as any).mockResolvedValueOnce([mockPendingRow]);

    const pending = await repo.getPendingUserById("p-123");

    expect(pending.id).toBe("p-123");
    expect(pending.username).toBe("pendingUser");
  });
});

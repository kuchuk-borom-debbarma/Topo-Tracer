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

describe("AuthRepoPg - getUserByFilter", () => {
  it("should get user by filter when password matches", async () => {
    const repo = new AuthRepoPg();
    const mockUserRow = {
      id: "u-123",
      username: "userA",
      email: "userA@test.com",
      password_hash: "d100d60430bb105d9d219c5c1c44b90249b29447134dfffc45589aae59845ae0",
      created_at: "2026-06-07T12:00:00Z",
      updated_at: "2026-06-07T12:00:00Z",
    };
    (mockSql as any).mockResolvedValueOnce([mockUserRow]);

    const user = await repo.getUserByFilter({
      email: "userA@test.com",
      password: "secure-password123",
    });

    expect(user.id).toBe("u-123");
    expect(user.username).toBe("userA");
  });

  it("should throw 401 on getUserByFilter if user does not exist", async () => {
    const repo = new AuthRepoPg();
    (mockSql as any).mockResolvedValueOnce([]);

    await expect(
      repo.getUserByFilter({
        email: "non-existent@test.com",
        password: "any-password",
      })
    ).rejects.toThrow("User not found or invalid credentials.");
  });

  it("should throw 401 on getUserByFilter if password mismatches", async () => {
    const repo = new AuthRepoPg();
    const mockUserRow = {
      id: "u-123",
      username: "userA",
      email: "userA@test.com",
      password_hash: "wrong_hash",
      created_at: "2026-06-07T12:00:00Z",
      updated_at: "2026-06-07T12:00:00Z",
    };
    (mockSql as any).mockResolvedValueOnce([mockUserRow]);

    await expect(
      repo.getUserByFilter({
        email: "userA@test.com",
        password: "secure-password123",
      })
    ).rejects.toThrow("User not found or invalid credentials.");
  });
});

describe("AuthRepoPg - insertUser", () => {
  it("should insert user with hashed password", async () => {
    const repo = new AuthRepoPg();
    const mockInsertedRow = {
      id: "u-new",
      username: "newUser",
      email: "new@test.com",
      created_at: "2026-06-07T12:00:00Z",
      updated_at: "2026-06-07T12:00:00Z",
    };
    (mockSql as any).mockResolvedValueOnce([mockInsertedRow]);

    const user = await repo.insertUser({
      username: "newUser",
      email: "new@test.com",
      password: "password456",
    });

    expect(user.id).toBe("u-new");
  });
});

describe("AuthRepoPg - getUserById & update", () => {
  it("should get user by ID", async () => {
    const repo = new AuthRepoPg();
    const mockUserRow = {
      id: "u-123",
      username: "userA",
      email: "userA@test.com",
      created_at: "2026-06-07T12:00:00Z",
      updated_at: "2026-06-07T12:00:00Z",
    };
    (mockSql as any).mockResolvedValueOnce([mockUserRow]);

    const user = await repo.getUserById("u-123");
    expect(user.id).toBe("u-123");
  });

  it("should update user password", async () => {
    const repo = new AuthRepoPg();
    const mockResult = [] as any;
    mockResult.count = 1;
    (mockSql as any).mockResolvedValueOnce(mockResult);

    await repo.updateUserPassword({
      userId: "u-123",
      password: "new-password",
    });
    expect(mockSql).toHaveBeenCalled();
  });
});

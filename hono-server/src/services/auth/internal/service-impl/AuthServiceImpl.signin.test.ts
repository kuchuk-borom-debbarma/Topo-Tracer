// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { createService, mockUser, jwtSecret } from "./test-helpers";

describe("AuthServiceImpl - SignIn Flow", () => {
  it("should verify credentials and return JWT token in getAuthToken", async () => {
    const { service, repo } = createService();

    (repo.getUserByFilter as any).mockResolvedValue(mockUser("user-789"));

    const token = await service.getAuthToken({
      email: "userA@test.com",
      password: "password123",
      jwtSecret,
    });

    expect(token).toBeDefined();
    expect(repo.getUserByFilter).toHaveBeenCalledWith({
      email: "userA@test.com",
      password: "password123",
    });
  });
});

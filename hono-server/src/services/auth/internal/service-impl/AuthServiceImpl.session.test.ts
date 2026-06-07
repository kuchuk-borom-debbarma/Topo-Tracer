// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { createService, mockUser, jwtSecret } from "./test-helpers";
import { generateToken } from "../util/jwt";

describe("AuthServiceImpl - Session / Profile Lookup Flow", () => {
  it("should authenticate and fetch user by token, utilizing cache on subsequent requests", async () => {
    const { service, repo } = createService();

    const userRecord = mockUser("user-789");
    (repo.getUserById as any).mockResolvedValue(userRecord);

    const token = await generateToken({ userId: "user-789", email: "userA@test.com" }, jwtSecret, 3600);

    // First request: Cache miss, fetches from database
    const user1 = await service.getUserByToken({ token, jwtSecret });
    expect(user1).toEqual(userRecord);
    expect(repo.getUserById).toHaveBeenCalledTimes(1);

    // Second request: Cache hit, does not call DB again
    const user2 = await service.getUserByToken({ token, jwtSecret });
    expect(user2).toEqual(userRecord);
    expect(repo.getUserById).toHaveBeenCalledTimes(1); // Still 1 call
  });
});

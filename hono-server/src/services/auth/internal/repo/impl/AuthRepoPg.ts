import { User } from "../../../api/types";
import { IAuthRepo } from "../IAuthRepo";
import { PendingUser, TokenOTP } from "../types";

export class AuthRepoPg extends IAuthRepo {
  getUserByFilter(filters: {
    email?: string;
    password?: string;
  }): Promise<User> {
    throw new Error("Method not implemented.");
  }

  insertUser(data: {
    username: string;
    email: string;
    password: string;
    isPasswordHashed?: boolean;
  }): Promise<User> {
    throw new Error("Method not implemented.");
  }

  insertPendingSignUpUser(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<PendingUser> {
    throw new Error("Method not implemented.");
  }

  getPendingUserById(token: string): Promise<PendingUser> {
    throw new Error("Method not implemented.");
  }

  upsertUserTokenOTP(data: {
    otp: string;
    token: string;
  }): Promise<TokenOTP> {
    throw new Error("Method not implemented.");
  }

  getTokenOTPById(token: string): Promise<TokenOTP> {
    throw new Error("Method not implemented.");
  }

  getUserById(token: string): Promise<User> {
    throw new Error("Method not implemented.");
  }
}

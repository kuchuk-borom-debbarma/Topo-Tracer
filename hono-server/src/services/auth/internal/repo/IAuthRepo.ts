import { User } from "../../api/types";
import { PendingUser, TokenOTP } from "./types";

export abstract class IAuthRepo {
  abstract getUserByFilter(filters: {
    email?: string;
    password?: string;
  }): Promise<User>;
  abstract insertUser(data: {
    username: string;
    email: string;
    password: string;
    isPasswordHashed?: boolean;
  }): Promise<User>;
  abstract insertPendingSignUpUser(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<PendingUser>;

  abstract getPendingUserById(token: string): Promise<PendingUser>;

  abstract upsertUserTokenOTP(data: {
    otp: string;
    token: string;
  }): Promise<TokenOTP>;

  abstract getTokenOTPById(token: string): Promise<TokenOTP>;

  abstract getUserById(token: string): Promise<User>;
}

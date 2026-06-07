import { User } from "./types";

/**
 * Interface contract for the Authentication Service.
 * Exposes the public capabilities of the auth service module.
 * Following code-base.md guidelines:
 * - Public types and interfaces are placed under api/.
 * - Keeps methods decoupled from direct implementation details.
 * - Uses object parameters for methods to allow easy extensions and keep signatures readable.
 */
export abstract class IAuthService {
  /**
   * Initiates the signup process for a new user.
   * Creates a pending registration in the database and generates an OTP.
   * 
   * @param data.username - The chosen username for the user.
   * @param data.email - The unique email address for the user.
   * @param data.password - The plain-text password (hashed internally before storage).
   * @returns A pending user/registration token ID.
   */
  // fallow-ignore-next-line unused-class-member
  abstract startSignUp(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<string>;

  /**
   * Finalizes the user registration by validating the generated OTP.
   * On success, promotes the pending user to a fully registered user.
   * 
   * @param data.token - The pending signup token ID returned by startSignUp.
   * @param data.otp - The one-time password to verify.
   * @throws TopoTraceException (403) if the OTP mismatches.
   */
  // fallow-ignore-next-line unused-class-member
  abstract finishSignUp(data: { token: string; otp: string }): Promise<void>;

  /**
   * Authenticates the user with their credentials and returns an authorization token.
   * 
   * @param data.email - Registered email of the user.
   * @param data.password - Password to authenticate.
   * @param data.jwtSecret - Secret key used to sign the JWT token.
   * @param data.expiresInSeconds - Optional expiration time of the token in seconds.
   * @returns A Promise resolving to a JWT token.
   */
  // fallow-ignore-next-line unused-class-member
  abstract getAuthToken(data: {
    email: string;
    password: string;
    jwtSecret: string;
    expiresInSeconds?: number;
  }): Promise<string>;

  /**
   * Initiates a password reset flow.
   * If the email exists, generates a reset token and OTP to be verified.
   * 
   * @param data.email - Registered email of the user.
   * @returns A Promise resolving to the reset token ID.
   */
  // fallow-ignore-next-line unused-class-member
  abstract startResetPassword(data: { email: string }): Promise<string>;

  /**
   * Finalizes the password reset flow.
   * Verifies the OTP matches the token, hashes and updates the user's password,
   * and cleans up all associated password reset OTPs.
   * 
   * @param data.token - The reset token ID.
   * @param data.otp - The one-time password verification code.
   * @param data.newPassword - The plain-text new password.
   * @throws TopoTraceException (403) if the OTP is invalid or mismatched.
   */
  // fallow-ignore-next-line unused-class-member
  abstract finishResetPassword(data: {
    token: string;
    otp: string;
    newPassword: string;
  }): Promise<void>;

  /**
   * Retrieves the user profile associated with a valid JWT token.
   * Decodes and verifies the token signature before performing database lookup.
   * 
   * @param data.token - The JWT token to verify.
   * @param data.jwtSecret - Secret key used to verify the JWT token signature.
   * @returns The User profile.
   * @throws TopoTraceException (401) if the token is invalid or expired.
   */
  // fallow-ignore-next-line unused-class-member
  abstract getUserByToken(data: {
    token: string;
    jwtSecret: string;
  }): Promise<User>;
}



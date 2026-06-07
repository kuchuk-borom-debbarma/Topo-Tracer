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
  abstract finishSignUp(data: { token: string; otp: string }): Promise<void>;

  /**
   * Authenticates the user with their credentials and returns an authorization token.
   * 
   * @param data.email - Registered email of the user.
   * @param data.password - Password to authenticate.
   * @returns A Promise resolving to a JWT token.
   */
  abstract getAuthToken(data: {
    email: string;
    password: string;
  }): Promise<string>;
}


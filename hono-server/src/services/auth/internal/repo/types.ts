/**
 * Represents a user whose registration is pending OTP verification.
 * Kept internal to the repository layer.
 */
export type PendingUser = {
  id: string;
  email: string;
  username: string;
  hashedPassword: string; // The hashed credential, kept strictly inside internal/
  traceId?: string;
  parentSpanId?: string;
};

/**
 * Represents the verification state (token and associated OTP code).
 * Used during the signup confirmation step.
 */
export type TokenOTP = {
  id: string;
  token: string; // References the pending user registration ID or registered user ID
  otp: string;   // The temporary verification code
  tokenType: "USER_SIGNUP" | "PASSWORD_RESET" | "DUMMY";
};



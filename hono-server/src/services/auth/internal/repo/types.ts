export type PendingUser = {
  id: string;
  username: string;
  email: string;
  hashedPassword: string;
  traceId?: string;
  parentSpanId?: string;
};

export type TokenOTP = {
  id: string;
  token: string;
  otp: string;
  tokenType: "USER_SIGNUP" | "PASSWORD_RESET" | "DUMMY";
};

export type ApiKeyRow = {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  keyVal: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

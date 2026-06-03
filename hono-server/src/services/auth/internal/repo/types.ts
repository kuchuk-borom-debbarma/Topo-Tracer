export type PendingUser = {
  id: string;
  email: string;
  username: string;
  hashedPassword: string;
};

export type TokenOTP = {
  id: string;
  token: string;
  otp: string;
  tokenType: "USER_SIGNUP" | "DUMMY";
};

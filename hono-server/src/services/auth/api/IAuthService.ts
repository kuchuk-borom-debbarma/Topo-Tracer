export abstract class IAuthService {
  abstract startSignUp(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<string>;
  abstract finishSignUp(data: { token: string; otp: string }): Promise<void>;
  abstract getAuthToken(data: {
    email: string;
    password: string;
  }): Promise<string>;
}

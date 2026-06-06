import { Logger } from "tslog";
import { IAuthService } from "../../api/IAuthService";
import { authRepo } from "../repo";
import { IAuthRepo } from "../repo/IAuthRepo";
import { TopoTraceException } from "../../../../common/types";

export class AuthServiceImpl extends IAuthService {
  readonly logger: Logger<unknown>;
  readonly authRepo: IAuthRepo;

  constructor(parentLogger: Logger<unknown>) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "AuthServiceImpl",
    });
    this.authRepo = authRepo;
  }
  async startSignUp(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<string> {
    this.logger.trace(`StartSignUp(${JSON.stringify(data)})`);
    try {
      // insert a pending user row
      const inserted = await this.authRepo.insertPendingSignUpUser(data);
      // generate OTP for the user
      const tokenOTP = await this.authRepo.upsertUserTokenOTP({
        token: inserted.id,
        otp: "12345", //TODO development only
      });
      //TODO use notification service to publish a message
      return tokenOTP.id;
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }
  async finishSignUp(data: { token: string; otp: string }): Promise<void> {
    this.logger.trace(`finishSignUp(${JSON.stringify(data)})`);
    try {
      // Get the TokenOTP by id
      const tokenOtp = await this.authRepo.getTokenOTPById(data.token);
      if (tokenOtp.otp !== data.otp) {
        throw new TopoTraceException("OTP Mismatch", 403);
      }
      // Get the user using TokenOTP
      const user = await this.authRepo.getPendingUserById(tokenOtp.token);
      // Insert into users
      await this.authRepo.insertUser({
        email: user.email,
        password: user.hashedPassword,
        username: user.username,
      });
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }
  async getAuthToken(data: {
    email: string;
    password: string;
  }): Promise<string> {
    this.logger.trace(`getAuthToken(${JSON.stringify(data)})`);
    const { email, password } = data;
    try {
      const user = await this.authRepo.getUserByFilter({
        email,
        password,
      });
      //TODO use jwt to generate token and return it
      return "";
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }
}

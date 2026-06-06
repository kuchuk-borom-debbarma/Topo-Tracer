import { rootLogger } from "../../common/logger";
import { IAuthService } from "./api/IAuthService";
import { AuthServiceImpl } from "./internal/service-impl/AuthServiceImpl";

export const authService: IAuthService = new AuthServiceImpl(rootLogger);

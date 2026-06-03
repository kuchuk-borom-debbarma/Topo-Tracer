import { rootLogger } from "../../common/logger";
import { ILogService } from "./api/ILogService";
import { LogServiceImpl } from "./internal/service-impl/LogServiceImpl";

export const logService: ILogService = new LogServiceImpl(rootLogger);

import { rootLogger } from "../../common/logger";
import { ILogService } from "./api/ILogService";
import { logWriteRepo } from "./internal/repo";
import { LogServiceImpl } from "./internal/service-impl/LogServiceImpl";

export const logService: ILogService = new LogServiceImpl(
  rootLogger,
  logWriteRepo,
);

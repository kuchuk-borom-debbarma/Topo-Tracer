import { rootLogger } from "../../common/logger";
import { eventBus } from "../../infra/event-bus";
import { ILogService } from "./api/ILogService";
import { LogServiceImpl } from "./internal/service-impl/LogServiceImpl";

export const logService: ILogService = new LogServiceImpl(rootLogger, eventBus);

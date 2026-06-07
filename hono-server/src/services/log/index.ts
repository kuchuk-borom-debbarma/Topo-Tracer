import { rootLogger } from "../../common/logger";
import { eventBus } from "../../infra/event-bus";
import { ILogService } from "./api/ILogService";
import { LogServiceImpl } from "./internal/service-impl/LogServiceImpl";

/**
 * Public wiring and export point for the Log Service module.
 * Following code-base.md guidelines:
 * - Instantiates LogServiceImpl and passes required singletons (rootLogger, eventBus).
 * - Exports the service under the ILogService interface contract.
 * - Outward modules import from this index file, bypassing internal implementation folders.
 */
export const logService: ILogService = new LogServiceImpl(rootLogger, eventBus);


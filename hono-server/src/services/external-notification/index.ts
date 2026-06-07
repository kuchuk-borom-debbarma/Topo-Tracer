import { rootLogger } from "../../common/logger";
import { IExternalNotificationService } from "./api/IExternalNotificationService";
import { ConsoleExternalNotificationServiceImpl } from "./internal/service-impl/ConsoleExternalNotificationServiceImpl";

/**
 * Public wiring and export point for the External Notification Service.
 * Following code-base.md guidelines:
 * - Instantiates ConsoleExternalNotificationServiceImpl using the rootLogger.
 * - Exports using the abstract contract type IExternalNotificationService.
 * - Restricts direct implementation imports from other modules.
 */
export const externalNotificationService: IExternalNotificationService =
  new ConsoleExternalNotificationServiceImpl(rootLogger);

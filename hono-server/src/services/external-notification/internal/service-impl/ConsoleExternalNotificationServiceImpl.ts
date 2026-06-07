import { Logger } from "tslog";
import { IExternalNotificationService } from "../../api/IExternalNotificationService";

/**
 * Console delivery implementation of the External Notification Service.
 * Following code-base.md guidelines:
 * - Resides under internal/service-impl/ to isolate the implementation.
 * - Prints out the delivery details using the structured child logger in development.
 */
export class ConsoleExternalNotificationServiceImpl extends IExternalNotificationService {
  readonly logger: Logger<unknown>;

  constructor(parentLogger: Logger<unknown>) {
    super();
    this.logger = parentLogger.getSubLogger({
      name: "ConsoleExternalNotificationServiceImpl",
    });
  }

  /**
   * Outputs the notification details to console/logs.
   */
  async sendNotification(data: {
    recipient: string;
    subject: string;
    body: string;
  }): Promise<void> {
    this.logger.trace(`sendNotification initiated for recipient="${data.recipient}"`);
    try {
      this.logger.info(`[EXTERNAL NOTIFICATION SYSTEM] - DEV/CONSOLE DELIVERY\nTo:      ${data.recipient}\nSubject: ${data.subject}\nBody:    ${data.body}`);
    } catch (err) {
      this.logger.error("Failed to output console notification", err);
      throw err;
    }
  }
}

/**
 * Interface contract for the External Notification Service.
 * Following code-base.md guidelines:
 * - Public interfaces and types reside inside api/.
 * - Keeps callers decoupled from concrete delivery channel implementations (e.g. email, SMS, console).
 * - Employs object parameters for method definitions.
 */
export abstract class IExternalNotificationService {
  /**
   * Dispatches a notification to the specified recipient.
   * 
   * @param data.recipient - Target identifier (e.g., email address, phone number).
   * @param data.subject - Subject/Title of the notification.
   * @param data.body - Content/Body message of the notification.
   */
  abstract sendNotification(data: {
    recipient: string;
    subject: string;
    body: string;
  }): Promise<void>;
}

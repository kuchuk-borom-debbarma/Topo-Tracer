import type { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import type { IExternalNotificationService } from "../../../external-notification/api/IExternalNotificationService";

/**
 * Background consumer that listens for the 'auth.signup.started' topic
 * and sends verification emails asynchronously.
 * Following code-base.md guidelines:
 * - Resides under internal/ to keep implementation detail clean.
 * - Subscribes using the IEventBus contract and utilizes standard callback structures.
 */
export class AuthEventConsumer {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly notificationService: IExternalNotificationService,
  ) {}

  /**
   * Initializes the subscriber.
   */
  async init(): Promise<void> {
    await this.eventBus.subscribe(
      {
        topic: "auth.signup.started",
        consumerName: "auth-event-consumer",
        batchSize: 10,
      },
      // fallow-ignore-next-line complexity
      async (events) => {
        for (const event of events) {
          const payload = event.data as { email: string; otp: string };
          if (!payload?.email || !payload?.otp) {
            continue;
          }

          await this.notificationService.sendNotification({
            recipient: payload.email,
            subject: "Verify your TopoTracer registration",
            body: `Your verification OTP code is: ${payload.otp}`,
          });
        }
      }
    );
  }
}

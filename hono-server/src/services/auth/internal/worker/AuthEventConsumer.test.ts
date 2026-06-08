// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { AuthEventConsumer } from "./AuthEventConsumer";
import { IEventBus } from "../../../../infra/event-bus/api/IEventBus";
import { IExternalNotificationService } from "../../../external-notification/api/IExternalNotificationService";

class MockEventBus extends IEventBus {
  publish = mock(async () => {});
  subscribe = mock(async (options: any, callback: any) => {
    this.lastOptions = options;
    this.lastCallback = callback;
  });

  lastOptions: any = null;
  lastCallback: any = null;
}

class MockNotificationService extends IExternalNotificationService {
  sendNotification = mock(async () => {});
}

describe("AuthEventConsumer", () => {
  it("should subscribe to auth.signup.started on init", async () => {
    const eventBus = new MockEventBus();
    const notificationService = new MockNotificationService();
    const consumer = new AuthEventConsumer(eventBus, notificationService);

    await consumer.init();

    expect(eventBus.subscribe).toHaveBeenCalled();
    expect(eventBus.lastOptions).toEqual({
      topic: "auth.signup.started",
      consumerName: "auth-event-consumer",
      batchSize: 10,
    });
    expect(eventBus.lastCallback).toBeTypeOf("function");
  });

  it("should process valid events and send notification emails", async () => {
    const eventBus = new MockEventBus();
    const notificationService = new MockNotificationService();
    const consumer = new AuthEventConsumer(eventBus, notificationService);

    await consumer.init();

    const mockEvents = [
      {
        id: "evt-1",
        topic: "auth.signup.started",
        idempotencyId: "id-1",
        key: "key-1",
        data: { email: "user@test.com", otp: "99887" },
        createdAt: new Date(),
      },
    ];

    await eventBus.lastCallback(mockEvents);

    expect(notificationService.sendNotification).toHaveBeenCalledWith({
      recipient: "user@test.com",
      subject: "Verify your TopoTracer registration",
      body: "Your verification OTP code is: 99887",
    });
  });

  it("should skip processing if event data is missing email or otp", async () => {
    const eventBus = new MockEventBus();
    const notificationService = new MockNotificationService();
    const consumer = new AuthEventConsumer(eventBus, notificationService);

    await consumer.init();

    const mockEvents = [
      {
        id: "evt-1",
        topic: "auth.signup.started",
        idempotencyId: "id-1",
        key: "key-1",
        data: { email: "user@test.com" }, // missing otp
        createdAt: new Date(),
      },
      {
        id: "evt-2",
        topic: "auth.signup.started",
        idempotencyId: "id-2",
        key: "key-2",
        data: { otp: "12345" }, // missing email
        createdAt: new Date(),
      },
      {
        id: "evt-3",
        topic: "auth.signup.started",
        idempotencyId: "id-3",
        key: "key-3",
        data: null, // missing data completely
        createdAt: new Date(),
      },
    ];

    await eventBus.lastCallback(mockEvents);

    expect(notificationService.sendNotification).not.toHaveBeenCalled();
  });
});

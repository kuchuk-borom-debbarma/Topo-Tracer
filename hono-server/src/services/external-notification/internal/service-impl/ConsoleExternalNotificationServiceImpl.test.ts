// fallow-ignore-file
import { describe, expect, it, mock } from "bun:test";
import { Logger } from "tslog";
import { ConsoleExternalNotificationServiceImpl } from "./ConsoleExternalNotificationServiceImpl";

describe("ConsoleExternalNotificationServiceImpl", () => {
  it("should successfully log notification details to console using the structured sub-logger", async () => {
    const infoMock = mock(() => {});
    const traceMock = mock(() => {});
    const mockLogger = {
      getSubLogger: mock(() => ({
        info: infoMock,
        trace: traceMock,
      })),
    } as unknown as Logger<unknown>;

    const service = new ConsoleExternalNotificationServiceImpl(mockLogger);
    await service.sendNotification({
      recipient: "test@example.com",
      subject: "Test Subject",
      body: "Hello World",
    });

    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(traceMock).toHaveBeenCalledTimes(1);
    expect(infoMock.mock.calls[0]?.[0]).toContain("[EXTERNAL NOTIFICATION SYSTEM]");
    expect(infoMock.mock.calls[0]?.[0]).toContain("To:      test@example.com");
  });
});

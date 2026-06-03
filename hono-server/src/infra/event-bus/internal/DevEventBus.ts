import { IEventBus } from "../api/IEventBus";

export class DevEventBus extends IEventBus {
  publish(
    data: {
      topic: string;
      idempotencyId: string;
      key?: string;
      data: unknown;
    }[],
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  subscribe(data: {
    topicToSubscriptTo: string;
    handler: () => Promise<void>;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

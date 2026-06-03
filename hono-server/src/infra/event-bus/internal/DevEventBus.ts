import {
  EventBusHandler,
  EventBusPublishEvent,
  EventBusPublishOptions,
  EventBusSubscribeOptions,
} from "../api/types";
import { IEventBus } from "../api/IEventBus";

export class DevEventBus extends IEventBus {
  publish(
    events: EventBusPublishEvent[],
    options?: EventBusPublishOptions,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  subscribe(
    options: EventBusSubscribeOptions,
    handler: EventBusHandler,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

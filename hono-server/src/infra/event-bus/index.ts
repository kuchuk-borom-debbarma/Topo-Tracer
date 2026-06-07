import { IEventBus } from "./api/IEventBus";
import { DevEventBus } from "./internal/DevEventBus";

export const eventBus: IEventBus = new DevEventBus();

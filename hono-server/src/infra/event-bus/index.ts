import { IEventBus } from "./api/IEventBus";
import { DevEventBus } from "./internal/DevEventBus";
import { KafkaEventBus } from "./internal/KafkaEventBus";
import { idempotencyStore } from "./idempotency";
import { outboxStore } from "./outbox";

const brokers = ((process as any).env.KAFKA_BROKERS || "localhost:9092").split(",");
const useKafka = (process as any).env.EVENT_BUS_TYPE === "kafka";

export const eventBus: IEventBus = useKafka
  ? new KafkaEventBus(brokers, idempotencyStore, outboxStore)
  : new DevEventBus(idempotencyStore, outboxStore);


import { IOutboxStore } from "./api/IOutboxStore";
import { PgOutboxStore } from "./internal/PgOutboxStore";
import { InMemoryOutboxStore } from "./internal/InMemoryOutboxStore";
import { OutboxRelay } from "./internal/OutboxRelay";

/**
 * Public wiring and export point for the Event Bus Outbox infrastructure.
 * Following code-base.md guidelines:
 * - Provides both Pg and in-memory implementations.
 * - Exports a default outboxStore singleton.
 */
export const outboxStore: IOutboxStore = new PgOutboxStore();

export * from "./api/IOutboxStore";
export { PgOutboxStore } from "./internal/PgOutboxStore";
// fallow-ignore-next-line unused-export
export { InMemoryOutboxStore } from "./internal/InMemoryOutboxStore";
// fallow-ignore-next-line unused-export
export { OutboxRelay } from "./internal/OutboxRelay";

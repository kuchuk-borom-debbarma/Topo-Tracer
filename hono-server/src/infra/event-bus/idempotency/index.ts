import { IIdempotencyStore } from "./api/IIdempotencyStore";
import { CacheIdempotencyStore } from "./internal/CacheIdempotencyStore";
import { InMemoryIdempotencyStore } from "./internal/InMemoryIdempotencyStore";
import { cache } from "../../cache";

/**
 * Public wiring and export point for the Event Bus Idempotency infrastructure.
 * Following code-base.md guidelines:
 * - Provides both standalone and cache-backed implementations.
 * - Exports a default idempotencyStore singleton.
 */
export const idempotencyStore: IIdempotencyStore = new CacheIdempotencyStore(cache);

export * from "./api/IIdempotencyStore";
export { CacheIdempotencyStore } from "./internal/CacheIdempotencyStore";
export { InMemoryIdempotencyStore } from "./internal/InMemoryIdempotencyStore";

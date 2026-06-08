/**
 * Interface contract for tracking and enforcing event idempotency.
 * Following code-base.md guidelines:
 * - Resides in api/ to define the public contract for this capability.
 */
export abstract class IIdempotencyStore {
  /**
   * Checks if an event has already been processed by a specific consumer group.
   *
   * @param consumerName - The name of the consumer group (deduplication scope).
   * @param idempotencyId - The stable identity of the event.
   * @returns Promise resolving to true if already processed, false otherwise.
   */
  abstract isProcessed(
    consumerName: string,
    idempotencyId: string,
  ): Promise<boolean>;

  /**
   * Marks an event as successfully processed for a specific consumer group.
   *
   * @param consumerName - The name of the consumer group.
   * @param idempotencyId - The stable identity of the event.
   */
  abstract markProcessed(
    consumerName: string,
    idempotencyId: string,
  ): Promise<void>;
}

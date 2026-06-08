import { EventBusPublishEvent } from "../../event-bus/api/types";

export type OutboxEvent = {
  id: string;
  topic: string;
  idempotencyId: string;
  key?: string;
  data: unknown;
  status: "pending" | "processing" | "sent" | "failed";
  createdAt: Date;
  sentAt?: Date | null;
};

/**
 * Interface contract for the Transactional Outbox Store.
 * Following code-base.md guidelines:
 * - Resides in api/ to expose public contracts.
 * - Decouples business logic/event buses from concrete Postgres database structures.
 * - Uses abstract class as the contract type.
 */
export abstract class IOutboxStore {
  /**
   * Persists a batch of events to the outbox table.
   * Can accept a transaction context (tx) to ensure atomicity.
   */
  abstract save(
    events: EventBusPublishEvent[],
    tx?: any,
  ): Promise<void>;

  /**
   * Atomically claims pending events and marks their status as 'processing'
   * using database locking (FOR UPDATE SKIP LOCKED) to prevent concurrent processing.
   * Commits immediately after marking them 'processing'.
   */
  abstract claimPending(limit?: number): Promise<OutboxEvent[]>;

  /**
   * Marks a batch of outbox events as successfully sent.
   */
  abstract markSent(ids: string[]): Promise<void>;

  /**
   * Reverts a batch of outbox events back to 'pending' on failure,
   * allowing them to be retried on subsequent polls.
   */
  abstract markFailed(ids: string[]): Promise<void>;

  /**
   * Reverts events stuck in 'processing' status back to 'pending'
   * if they have been in that state longer than olderThanMs.
   */
  abstract recoverStuck(olderThanMs: number): Promise<void>;
}

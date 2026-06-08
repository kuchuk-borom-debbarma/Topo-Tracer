import { IOutboxStore, OutboxEvent } from "../api/IOutboxStore";
import { EventBusPublishEvent } from "../../event-bus/api/types";
import { postgres } from "../../db";

/**
 * PostgreSQL implementation of IOutboxStore.
 * Following code-base.md guidelines:
 * - Resides under internal/ to isolate DB client operations.
 * - Utilizes the initialized postgres client helper.
 * - Implements industry-standard FOR UPDATE SKIP LOCKED concurrency locks.
 */
export class PgOutboxStore extends IOutboxStore {
  private get sql() {
    return postgres.getInitializedPostgresClient();
  }

  async save(events: EventBusPublishEvent[], tx?: any): Promise<void> {
    if (events.length === 0) return;

    const client = tx ?? this.sql;
    const rows = events.map((event) => ({
      id: crypto.randomUUID(),
      topic: event.topic,
      idempotency_id: event.idempotencyId,
      key: event.key ?? null,
      data: typeof event.data === "string" ? event.data : JSON.stringify(event.data),
      status: "pending",
    }));

    await client`
      INSERT INTO outbox_events ${client(rows, "id", "topic", "idempotency_id", "key", "data", "status")}
    `;
  }

  async claimPending(limit = 100): Promise<OutboxEvent[]> {
    const claimed = await this.sql.begin(async (tx) => {
      const rows = await tx<any[]>`
        SELECT id, topic, idempotency_id, key, data, status, created_at, sent_at
        FROM outbox_events
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((r) => r.id);
      await tx`
        UPDATE outbox_events
        SET status = 'processing'
        WHERE id = ANY(${ids})
      `;

      return rows;
    });

    return claimed.map((row) => {
      let data: unknown;
      try {
        data = JSON.parse(row.data);
      } catch {
        data = row.data;
      }

      return {
        id: row.id,
        topic: row.topic,
        idempotencyId: row.idempotency_id,
        key: row.key ?? undefined,
        data,
        status: "processing",
        createdAt: new Date(row.created_at),
        sentAt: row.sent_at ? new Date(row.sent_at) : null,
      };
    });
  }

  async markSent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.sql`
      UPDATE outbox_events
      SET status = 'sent', sent_at = NOW()
      WHERE id = ANY(${ids})
    `;
  }

  async markFailed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.sql`
      UPDATE outbox_events
      SET status = 'pending'
      WHERE id = ANY(${ids})
    `;
  }
}

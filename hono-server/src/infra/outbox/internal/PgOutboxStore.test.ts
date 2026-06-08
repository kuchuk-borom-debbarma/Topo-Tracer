// fallow-ignore-file
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { PgOutboxStore } from "./PgOutboxStore";

const queries: Array<{ sql: string; values: any[] }> = [];

const mockSql = mock((strings: any, ...values: any[]) => {
  if (Array.isArray(strings) && "raw" in strings) {
    // reconstruct query
    let sql = strings[0] || "";
    for (let i = 0; i < values.length; i++) {
      sql += `$${i + 1}` + (strings[i + 1] || "");
    }
    queries.push({ sql, values });
    return Promise.resolve([]);
  }
  return {};
}) as any;

// Mock the postgres helper functions
mockSql.begin = mock(async (fn: any) => {
  return fn(mockSql);
});

(mock as any).module("../../db", () => {
  return {
    postgres: {
      getInitializedPostgresClient: () => mockSql,
    },
  };
});

describe("PgOutboxStore", () => {
  beforeEach(() => {
    queries.length = 0;
    mockSql.mockClear();
    (mockSql.begin as any).mockClear();
  });

  it("should insert events using default sql client when tx is not provided", async () => {
    const store = new PgOutboxStore();
    const mockEvents = [
      { topic: "topic-1", idempotencyId: "idem-1", data: { foo: "bar" } },
    ];

    await store.save(mockEvents);

    expect(mockSql).toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("INSERT INTO outbox_events");
    // Should pass the rows representation to pg client helper helper
    expect(queries[0].values).toHaveLength(1);
  });

  it("should insert events using transaction client tx when provided", async () => {
    const store = new PgOutboxStore();
    const mockEvents = [
      { topic: "topic-1", idempotencyId: "idem-1", data: { foo: "bar" } },
    ];

    const mockTx = mock((strings: any, ...values: any[]) => {
      if (Array.isArray(strings) && "raw" in strings) {
        let sql = strings[0] || "";
        for (let i = 0; i < values.length; i++) {
          sql += `$${i + 1}` + (strings[i + 1] || "");
        }
        queries.push({ sql, values });
        return Promise.resolve([]);
      }
      return {};
    }) as any;

    await store.save(mockEvents, mockTx);

    expect(mockSql).not.toHaveBeenCalled();
    expect(mockTx).toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("INSERT INTO outbox_events");
  });

  it("should claim pending events under a transaction with SKIP LOCKED", async () => {
    const store = new PgOutboxStore();
    const mockRows = [
      {
        id: "evt-123",
        topic: "topic-1",
        idempotency_id: "idem-1",
        key: "key-1",
        data: '{"foo":"bar"}',
        status: "pending",
        created_at: "2026-06-08T00:00:00Z",
        sent_at: null,
      },
    ];

    // Mock query resolution for claimPending
    // First query is SELECT FOR UPDATE SKIP LOCKED
    // Second query is UPDATE outbox_events SET status = 'processing'
    (mockSql as any).mockImplementation((strings: any, ...values: any[]) => {
      if (Array.isArray(strings) && "raw" in strings) {
        let sql = strings[0] || "";
        for (let i = 0; i < values.length; i++) {
          sql += `$${i + 1}` + (strings[i + 1] || "");
        }
        queries.push({ sql, values });

        if (sql.includes("SELECT")) {
          return Promise.resolve(mockRows);
        }
        return Promise.resolve([]);
      }
      return {};
    });

    const claimed = await store.claimPending(5);

    expect(mockSql.begin).toHaveBeenCalled();
    expect(queries).toHaveLength(2);

    expect(queries[0].sql).toContain("SELECT");
    expect(queries[0].sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(queries[0].sql).toContain("LIMIT $1");
    expect(queries[0].values).toEqual([5]);

    expect(queries[1].sql).toContain("UPDATE outbox_events");
    expect(queries[1].sql).toContain("SET status = 'processing'");
    expect(queries[1].values[0]).toEqual(["evt-123"]);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe("evt-123");
    expect(claimed[0].data).toEqual({ foo: "bar" });
  });

  it("should mark events as sent with timestamp", async () => {
    const store = new PgOutboxStore();
    await store.markSent(["evt-123", "evt-456"]);

    expect(mockSql).toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("SET status = 'sent'");
    expect(queries[0].sql).toContain("WHERE id = ANY($1)");
    expect(queries[0].values[0]).toEqual(["evt-123", "evt-456"]);
  });

  it("should mark events as failed by reverting to pending status", async () => {
    const store = new PgOutboxStore();
    await store.markFailed(["evt-123"]);

    expect(mockSql).toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("SET status = 'pending'");
    expect(queries[0].sql).toContain("WHERE id = ANY($1)");
    expect(queries[0].values[0]).toEqual(["evt-123"]);
  });
});

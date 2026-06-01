import { Service } from "@carno.js/core";
import { randomUUID } from "node:crypto";
import { ClickHouseService } from "../../infra/ClickHouseService";
import type { TraceEventInput, TraceEventRecord } from "./types";

@Service()
export class RawEventRepository {
  constructor(private clickhouse: ClickHouseService) {}

  async append(events: TraceEventInput[]): Promise<number> {
    if (!events.length) return 0;

    const receivedAtUnixMs = Date.now();
    const rows = events.map((event) => ({
      trace_id: event.traceId,
      event_id: event.eventId || randomUUID(),
      entity_id: event.entityId,
      entity_type: event.entityType,
      event_type: event.eventType,
      occurred_at_ms: event.occurredAtUnixMs,
      received_at_ms: receivedAtUnixMs,
      parent_id: event.parentId ?? null,
      container_id: event.containerId ?? null,
      from_id: event.fromId ?? null,
      to_id: event.toId ?? null,
      kind: event.kind ?? null,
      name: event.name ?? null,
      status: event.status ?? null,
      metadata: JSON.stringify(event.metadata ?? {}),
    }));

    await this.clickhouse.client.insert({
      table: "topo_tracer.trace_events",
      values: rows,
      format: "JSONEachRow",
    });

    return rows.length;
  }

  async listTraceIdsNeedingMaterialization(limit = 20): Promise<string[]> {
    const query = `
      SELECT trace_id
      FROM (
        SELECT trace_id, max(received_at_ms) AS latest_event_at
        FROM topo_tracer.trace_events
        GROUP BY trace_id
      ) AS raw
      LEFT JOIN (
        SELECT trace_id, max(materialized_at_ms) AS latest_materialized_at
        FROM topo_tracer.read_trace_summary
        GROUP BY trace_id
      ) AS summary USING trace_id
      WHERE latest_materialized_at IS NULL OR latest_event_at > latest_materialized_at
      ORDER BY latest_event_at ASC
      LIMIT ${limit}
    `;

    const result = await this.clickhouse.client.query({ query, format: "JSONEachRow" });
    const rows = await result.json<{ trace_id: string }>();
    return rows.map((row) => row.trace_id);
  }

  async getTraceEvents(traceId: string): Promise<TraceEventRecord[]> {
    const result = await this.clickhouse.client.query({
      query: `
        SELECT *
        FROM topo_tracer.trace_events
        WHERE trace_id = {traceId:String}
        ORDER BY received_at_ms ASC, event_id ASC
      `,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();

    return rows.map((row) => ({
      eventId: row.event_id,
      traceId: row.trace_id,
      entityId: row.entity_id,
      entityType: row.entity_type,
      eventType: row.event_type,
      occurredAtUnixMs: Number(row.occurred_at_ms),
      receivedAtUnixMs: Number(row.received_at_ms),
      parentId: row.parent_id ?? null,
      containerId: row.container_id ?? null,
      fromId: row.from_id ?? null,
      toId: row.to_id ?? null,
      kind: row.kind ?? null,
      name: row.name ?? null,
      status: row.status ?? null,
      metadata: safeJson(row.metadata),
    }));
  }
}

function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

import { Service } from "@carno.js/core";
import { randomUUID } from "node:crypto";
import { ClickHouseService } from "../../infra/ClickHouseService";
import type { RawEventAppendResult, RawEventStore } from "./contracts";
import type { TraceEventInput, TraceEventRecord } from "./types";

@Service()
export class RawEventRepository implements RawEventStore {
  constructor(private clickhouse: ClickHouseService) {}

  async append(events: TraceEventInput[]): Promise<RawEventAppendResult> {
    if (!events.length) return { count: 0, traceIds: [], eventIds: [] };

    const receivedAtUnixMs = Date.now();
    const rows = events.map((event) => ({
      trace_id: event.traceId,
      event_id: event.eventId || randomUUID(),
      entity_id: event.entityId,
      entity_type: event.entityType,
      event_type: event.eventType,
      occurred_at_ms: event.occurredAtUnixMs,
      received_at_ms: receivedAtUnixMs,
      name: event.name ?? null,
      importance_level: event.importanceLevel ?? null,
      from_node_id: event.fromNodeId ?? null,
      to_node_id: event.toNodeId ?? null,
      label: event.label ?? null,
      status: event.status ?? null,
      data: JSON.stringify(event.data ?? {}),
    }));

    await this.clickhouse.client.insert({
      table: "topo_tracer.node_trace_events",
      values: rows,
      format: "JSONEachRow",
    });

    return {
      count: events.length,
      traceIds: Array.from(new Set(rows.map((row) => row.trace_id))),
      eventIds: rows.map((row) => row.event_id),
    };
  }

  async listTraceIdsNeedingMaterialization(limit = 20): Promise<string[]> {
    const result = await this.clickhouse.client.query({
      query: `
        SELECT raw.trace_id
        FROM (
          SELECT trace_id, max(received_at_ms) AS latest_event_at
          FROM topo_tracer.node_trace_events
          GROUP BY trace_id
        ) AS raw
        LEFT JOIN (
          SELECT trace_id, max(materialized_at_ms) AS latest_materialized_at
          FROM topo_tracer.node_trace_summary
          GROUP BY trace_id
        ) AS summary USING trace_id
        WHERE latest_materialized_at IS NULL OR latest_event_at > latest_materialized_at
        ORDER BY latest_event_at ASC
        LIMIT {limit:UInt32}
      `,
      query_params: { limit },
      format: "JSONEachRow",
    });
    const rows = await result.json<{ trace_id: string }>();
    return rows.map((row) => row.trace_id);
  }

  async getTraceEvents(traceId: string): Promise<TraceEventRecord[]> {
    const result = await this.clickhouse.client.query({
      query: `
        SELECT
          event_id,
          argMax(trace_id, received_at_ms) AS event_trace_id,
          argMax(entity_id, received_at_ms) AS entity_id,
          argMax(entity_type, received_at_ms) AS entity_type,
          argMax(event_type, received_at_ms) AS event_type,
          argMax(occurred_at_ms, received_at_ms) AS occurred_at_ms,
          max(received_at_ms) AS latest_received_at_ms,
          min(received_at_ms) AS first_received_at_ms,
          argMax(name, received_at_ms) AS name,
          argMax(importance_level, received_at_ms) AS importance_level,
          argMax(from_node_id, received_at_ms) AS from_node_id,
          argMax(to_node_id, received_at_ms) AS to_node_id,
          argMax(label, received_at_ms) AS label,
          argMax(status, received_at_ms) AS status,
          argMax(data, received_at_ms) AS data
        FROM topo_tracer.node_trace_events
        WHERE trace_id = {traceId:String}
        GROUP BY event_id
        ORDER BY first_received_at_ms ASC, event_id ASC
      `,
      query_params: { traceId },
      format: "JSONEachRow",
    });
    const rows = await result.json<any>();

    return rows.map((row) => ({
      eventId: row.event_id,
      traceId: row.event_trace_id,
      entityId: row.entity_id,
      entityType: row.entity_type,
      eventType: row.event_type,
      occurredAtUnixMs: Number(row.occurred_at_ms),
      receivedAtUnixMs: Number(row.latest_received_at_ms),
      name: row.name ?? null,
      importanceLevel: row.importance_level === null || row.importance_level === undefined
        ? null
        : Number(row.importance_level),
      fromNodeId: row.from_node_id ?? null,
      toNodeId: row.to_node_id ?? null,
      label: row.label ?? null,
      status: row.status ?? null,
      data: parseJson(row.data),
    }));
  }
}

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

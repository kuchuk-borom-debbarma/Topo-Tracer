import { Service } from "@carno.js/core";
import { EventBus } from "../../infra/events/EventBus";
import type { TraceLogService } from "./contracts";
import { RawEventRepository } from "./RawEventRepository";
import { ReadModelRepository } from "./ReadModelRepository";
import type {
  GraphWindowQuery,
  GraphWindowResponse,
  TraceEventInput,
  TraceListResponse,
  TraceSummary,
} from "./types";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;

@Service()
export class LogService implements TraceLogService {
  constructor(
    private rawEvents: RawEventRepository,
    private readModels: ReadModelRepository,
    private eventBus: EventBus,
  ) {}

  async ingestEvents(events: TraceEventInput[]): Promise<{ ok: true; count: number }> {
    validateEvents(events);
    const result = await this.rawEvents.append(events);

    if (result.count > 0) {
      await this.eventBus.publish({
        type: "trace.events.ingested",
        idempotencyKey: buildTraceIngestedKey(result.eventIds),
        payload: {
          traceIds: result.traceIds,
          eventCount: result.count,
        },
      });
    }

    return { ok: true, count: result.count };
  }

  listTraces(page: number, limit: number): Promise<TraceListResponse> {
    return this.readModels.listTraces(page, limit);
  }

  getTraceSummary(traceId: string): Promise<TraceSummary | null> {
    return this.readModels.getSummary(traceId);
  }

  async getGraph(traceId: string, query: GraphWindowQuery): Promise<GraphWindowResponse | null> {
    const summary = await this.readModels.getSummary(traceId);
    if (!summary) return null;

    const maxImportance = clampImportance(query.maxImportance, summary.maxImportanceLevel);
    const limit = clampLimit(query.limit);
    const offset = decodeCursor(query.cursor) ?? 0;
    const projected = await this.readModels.getProjectedGraph({ traceId, maxImportance, limit, offset });

    return {
      metadata: {
        traceId,
        maxImportance,
        limit,
        returnedNodeCount: projected.nodes.length,
        totalNodeCount: summary.nodeCount,
        hiddenNodeCount: projected.hiddenNodeCount,
        ghostNodeCount: projected.ghostNodeCount,
        hasBefore: offset > 0,
        hasAfter: offset + limit < projected.projectedNodeCount,
        previousCursor: offset > 0 ? encodeCursor(Math.max(0, offset - limit)) : null,
        nextCursor: offset + limit < projected.projectedNodeCount ? encodeCursor(offset + limit) : null,
      },
      summary,
      nodes: projected.nodes,
      edges: projected.edges,
    };
  }
}

function validateEvents(events: TraceEventInput[]): void {
  if (!Array.isArray(events)) throw new Error("Request body must be an array");
  for (const event of events) {
    if (!event.traceId || !event.entityId || !event.entityType || !event.eventType) {
      throw new Error("Event missing traceId/entityId/entityType/eventType");
    }
    if (!Number.isFinite(event.occurredAtUnixMs)) throw new Error("Event missing valid occurredAtUnixMs");
    if (event.importanceLevel !== undefined && event.importanceLevel !== null) {
      if (!Number.isFinite(event.importanceLevel) || event.importanceLevel < 0) {
        throw new Error("importanceLevel must be a non-negative number");
      }
    }
    if (event.entityType === "node" && event.eventType !== "node.started" && event.eventType !== "node.ended") {
      throw new Error("Node entity requires node.* event type");
    }
    if (event.entityType === "edge" && event.eventType !== "edge.started" && event.eventType !== "edge.ended") {
      throw new Error("Edge entity requires edge.* event type");
    }
  }
}

function buildTraceIngestedKey(eventIds: string[]): string {
  return `trace.events.ingested:${eventIds.slice().sort().join(",")}`;
}

function clampImportance(value: number | undefined, maxImportanceLevel: number): number {
  if (!Number.isFinite(value)) return Math.min(2, maxImportanceLevel);
  return Math.max(0, Math.min(maxImportanceLevel, Math.floor(value!)));
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value!)));
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number | null {
  if (!cursor) return null;
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  } catch {
    return null;
  }
}

import { Body, Controller, Get, Param, Post, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { FlowWindowQuery, TraceEventInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  @Post("/events")
  async ingestEvents(@Body() events: TraceEventInput[]) {
    console.log(`[HTTP POST] /telemetry/events - Ingesting ${events.length} event(s)`);
    return this.logService.ingestEvents(events);
  }

  @Get("/traces")
  async listTraces(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNumber = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;
    return this.logService.listTraces(pageNumber, limitNumber);
  }

  @Get("/traces/:traceId/summary")
  async getTraceSummary(@Param("traceId") traceId: string) {
    return this.logService.getTraceSummary(traceId);
  }

  @Get("/traces/:traceId/flow-window")
  async getFlowWindow(
    @Param("traceId") traceId: string,
    @Query("anchorId") anchorId?: string,
    @Query("direction") direction?: string,
    @Query("before") before?: string,
    @Query("after") after?: string,
    @Query("expandedIds") expandedIds?: string,
    @Query("hiddenIds") hiddenIds?: string,
    @Query("detailBudget") detailBudget?: string,
    @Query("cursor") cursor?: string,
  ) {
    const query: FlowWindowQuery = {
      anchorId,
      direction: direction === "before" || direction === "after" ? direction : "around",
      before: before ? parseInt(before, 10) : undefined,
      after: after ? parseInt(after, 10) : undefined,
      expandedIds: parseCsv(expandedIds),
      hiddenIds: parseCsv(hiddenIds),
      detailBudget: detailBudget ? parseInt(detailBudget, 10) : undefined,
      cursor,
    };

    return this.logService.getFlowWindow(traceId, query);
  }
}

function parseCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

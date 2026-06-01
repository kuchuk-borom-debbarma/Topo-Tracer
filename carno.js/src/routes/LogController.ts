import { Body, Controller, Get, Param, Post, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { GraphWindowQuery, TraceEventInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  @Post("/events")
  async ingestEvents(@Body() events: TraceEventInput[]) {
    return this.logService.ingestEvents(events);
  }

  @Get("/traces")
  async listTraces(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.logService.listTraces(
      page ? Math.max(1, parseInt(page, 10)) : 1,
      limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20,
    );
  }

  @Get("/traces/:traceId/summary")
  async getTraceSummary(@Param("traceId") traceId: string) {
    return this.logService.getTraceSummary(traceId);
  }

  @Get("/traces/:traceId/graph")
  async getGraph(
    @Param("traceId") traceId: string,
    @Query("maxImportance") maxImportance?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const query: GraphWindowQuery = {
      maxImportance: maxImportance ? parseInt(maxImportance, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    };
    return this.logService.getGraph(traceId, query);
  }
}

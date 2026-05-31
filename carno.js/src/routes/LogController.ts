import { Body, Controller, Get, Param, Post, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { TraceEdgeInput, TraceSpanInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  @Post("/spans")
  async logSpans(@Body() spans: TraceSpanInput[]) {
    await this.logService.logSpans(spans);
    return { ok: true, count: spans.length };
  }

  @Post("/edges")
  async logEdges(@Body() edges: TraceEdgeInput[]) {
    await this.logService.logEdges(edges);
    return { ok: true, count: edges.length };
  }

  @Get("/trace/:traceId")
  async getTraceLayout(
    @Param("traceId") traceId: string,
    @Query("maxLevel") maxLevel?: string
  ) {
    const maxLevelNum = maxLevel !== undefined ? parseInt(maxLevel, 10) : undefined;
    return await this.logService.getTraceLayout(traceId, maxLevelNum);
  }

  @Get("/traces")
  async listTraces(
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const p = page ? Math.max(1, parseInt(page, 10)) : 1;
    const l = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;
    return await this.logService.listTraces(p, l);
  }
}

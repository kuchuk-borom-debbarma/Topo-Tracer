import { Body, Controller, Get, Param, Post, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { TraceEdgeInput, TraceSpanInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  @Post("/spans")
  async logSpans(@Body() spans: TraceSpanInput[]) {
    console.log(`[HTTP POST] /telemetry/spans - Ingesting ${spans.length} span(s)`);
    await this.logService.logSpans(spans);
    return { ok: true, count: spans.length };
  }

  @Post("/edges")
  async logEdges(@Body() edges: TraceEdgeInput[]) {
    console.log(`[HTTP POST] /telemetry/edges - Ingesting ${edges.length} edge(s)`);
    await this.logService.logEdges(edges);
    return { ok: true, count: edges.length };
  }

  @Get("/trace/:traceId")
  async getTraceLayout(
    @Param("traceId") traceId: string,
    @Query("maxLevel") maxLevel?: string
  ) {
    const maxLevelNum = maxLevel !== undefined ? parseInt(maxLevel, 10) : undefined;
    console.log(`[HTTP GET] /telemetry/trace/${traceId} - Fetching layout (maxLevel: ${maxLevelNum ?? "default"})`);
    const layout = await this.logService.getTraceLayout(traceId, maxLevelNum);
    if (layout) {
      console.log(`[HTTP GET] /telemetry/trace/${traceId} - Found cached layout with ${layout.spans.length} span(s), ${layout.edges.length} edge(s), and ${layout.ghostSpans.length} ghost span(s)`);
    } else {
      console.log(`[HTTP GET] /telemetry/trace/${traceId} - Layout not found`);
    }
    return layout;
  }

  @Get("/traces")
  async listTraces(
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const p = page ? Math.max(1, parseInt(page, 10)) : 1;
    const l = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;
    console.log(`[HTTP GET] /telemetry/traces - Listing traces (page: ${p}, limit: ${l})`);
    const result = await this.logService.listTraces(p, l);
    console.log(`[HTTP GET] /telemetry/traces - Returning ${result.traces.length} trace(s) out of ${result.total} total`);
    return result;
  }
}

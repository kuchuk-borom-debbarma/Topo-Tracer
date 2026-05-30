import { Body, Controller, Get, Param, Post, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { TraceContainerInput, TraceEdgeInput, TraceNodeInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  @Post("/containers")
  async logContainers(@Body() containers: TraceContainerInput[]) {
    await this.logService.logContainers(containers);
    return { ok: true, count: containers.length };
  }

  @Post("/nodes")
  async logNodes(@Body() nodes: TraceNodeInput[]) {
    await this.logService.logNodes(nodes);
    return { ok: true, count: nodes.length };
  }

  @Post("/edges")
  async logEdges(@Body() edges: TraceEdgeInput[]) {
    await this.logService.logEdges(edges);
    return { ok: true, count: edges.length };
  }

  @Get("/trace/:traceId")
  async getTraceLayout(
    @Param("traceId") traceId: string
  ) {
    return await this.logService.getTraceLayout(traceId);
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

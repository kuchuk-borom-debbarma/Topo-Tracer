import { Body, Controller, Get, Param, Post, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { TraceBlockInput, TraceContainerInput, TraceEdgeInput, TraceNodeInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  @Post("/containers")
  async logContainers(@Body() containers: TraceContainerInput[]) {
    await this.logService.logContainers(containers);
    return { ok: true, count: containers.length };
  }

  @Post("/blocks")
  async logBlocks(@Body() blocks: TraceBlockInput[]) {
    await this.logService.logBlocks(blocks);
    return { ok: true, count: blocks.length };
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
    @Param("traceId") traceId: string,
    @Query("zoom_level") zoomLevel?: string
  ) {
    const level = zoomLevel !== undefined ? parseInt(zoomLevel, 10) : undefined;
    return await this.logService.getTraceLayout(traceId, level);
  }
}


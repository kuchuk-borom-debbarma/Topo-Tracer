import { Controller, Post, Body, Get, Param, Query } from "@carno.js/core";
import { LogService } from "../services/log/LogService";
import type { ContainerInput, NodeInput, EdgeInput } from "../services/log/types";

@Controller("/telemetry")
export class LogController {
  constructor(private logService: LogService) {}

  // Push a batch of container limits to the database
  @Post("/containers")
  async logContainers(@Body() containers: ContainerInput[]) {
    console.log(`[LogController] Received batch of ${containers.length} containers`);
    await this.logService.logContainers(containers);
    return { ok: true, count: containers.length };
  }

  // Push a batch of execution stack nodes to the database
  @Post("/nodes")
  async logNodes(@Body() nodes: NodeInput[]) {
    console.log(`[LogController] Received batch of ${nodes.length} nodes`);
    await this.logService.logNodes(nodes);
    return { ok: true, count: nodes.length };
  }

  // Push a batch of network transition edges to the database
  @Post("/edges")
  async logEdges(@Body() edges: EdgeInput[]) {
    console.log(`[LogController] Received batch of ${edges.length} edges`);
    await this.logService.logEdges(edges);
    return { ok: true, count: edges.length };
  }

  // Shift and align a batch of container timestamps in-memory
  @Post("/containers/update-times")
  async updateContainerTimes(@Body() containers: ContainerInput[]) {
    console.log(`[LogController] Shifting times for ${containers.length} containers`);
    return await this.logService.updateContainerLocalTimes(containers);
  }

  // Shift and align a batch of stack node timestamps in-memory, preserving relative offsets
  @Post("/nodes/update-times")
  async updateNodeTimes(@Body() nodes: NodeInput[]) {
    console.log(`[LogController] Shifting times for ${nodes.length} nodes`);
    return await this.logService.updateNodeLocalTimes(nodes);
  }

  // Shift and align a batch of network edge timestamps in-memory, preserving relative offsets
  @Post("/edges/update-times")
  async updateEdgeTimes(@Body() edges: EdgeInput[]) {
    console.log(`[LogController] Shifting times for ${edges.length} edges`);
    return await this.logService.updateEdgeLocalTimes(edges);
  }

  // Fetch a paginated chunk of nodes and matching edges for a given trace sequentially
  @Get("/trace/:traceId")
  async getTrace(
    @Param("traceId") traceId: string,
    @Query("limit") limit?: string,
    @Query("depth") depth?: string,
    @Query("beforeTime") beforeTime?: string,
    @Query("beforeId") beforeId?: string,
    @Query("afterTime") afterTime?: string,
    @Query("afterId") afterId?: string
  ) {
    const rawLimit = limit ? parseInt(limit, 10) : undefined;
    const rawDepth = depth ? parseInt(depth, 10) : undefined;
    const rawBeforeTime = beforeTime ? parseInt(beforeTime, 10) : undefined;
    const rawAfterTime = afterTime ? parseInt(afterTime, 10) : undefined;

    console.log(`[LogController] Paginated unified fetch request for trace ${traceId} (limit: ${rawLimit}, depth: ${rawDepth})`);

    return await this.logService.logTracePaginated(traceId, {
      limit: rawLimit,
      depth: rawDepth,
      beforeTime: rawBeforeTime,
      beforeId,
      afterTime: rawAfterTime,
      afterId,
    });
  }

  // Fetch metadata for a specific trace, such as whether zoom is fully materialized
  @Get("/trace/:traceId/metadata")
  async getTraceMetadata(@Param("traceId") traceId: string) {
    console.log(`[LogController] Fetching metadata for trace ${traceId}`);
    return await this.logService.fetchTraceMetadata(traceId);
  }
}


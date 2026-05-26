import { describe, expect, it } from "bun:test";
import { LogServiceImpl } from "./LogServiceImpl";
import { MockLogRepo } from "./repo-impls/MockLogRepo";
import type { PaginationParams, PaginatedTraceResult } from "../types";

describe("LogServiceImpl - Reads Unit Tests", () => {
  it("should successfully invoke repository with correct traceId and cursor settings", async () => {
    const mockRepo = new MockLogRepo();
    const service = new LogServiceImpl(mockRepo);

    const expectedEnvelope: PaginatedTraceResult = {
      nodes: [],
      edges: [],
      pagination: {
        prevTimeCursor: 100,
        prevIdCursor: "A",
        nextTimeCursor: 200,
        nextIdCursor: "B",
        hasPrev: true,
        hasNext: true
      }
    };
    mockRepo.setFetchTraceResult(expectedEnvelope);

    const queryParams: PaginationParams = {
      limit: 25,
      afterTime: 100,
      afterId: "A",
      beforeTime: 200,
      beforeId: "B"
    };

    const response = await service.logTracePaginated("trace_abc_123", queryParams);

    expect(mockRepo.lastTraceIdFetched).toBe("trace_abc_123");
    expect(mockRepo.lastParamsUsed.limit).toBe(25);
    expect(mockRepo.lastParamsUsed.afterTime).toBe(100);
    expect(mockRepo.lastParamsUsed.afterId).toBe("A");
    expect(mockRepo.lastParamsUsed.beforeTime).toBe(200);
    expect(mockRepo.lastParamsUsed.beforeId).toBe("B");
    
    expect(response).toEqual(expectedEnvelope);
  });
});

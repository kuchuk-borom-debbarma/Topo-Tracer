import { mock } from "bun:test";
import { Logger } from "tslog";
import { LogReadRepoClickHouse } from "./LogReadRepoClickHouse";

export type InsertOptions = {
  table: string;
  values: unknown[];
  format: "JSONEachRow";
};

export type QueryOptions = {
  query: string;
  format: "JSONEachRow";
  query_params?: Record<string, string | number | string[]>;
};

export type ClickHouseClientProvider = () => {
  insert(options: InsertOptions): Promise<void>;
  query(options: QueryOptions): Promise<{ json<T>(): Promise<T[]> }>;
};

// Use type casting for testing with a fake provider
export const RepoWithProvider = LogReadRepoClickHouse as unknown as new (
  parentLogger: Logger<unknown>,
  getClient: ClickHouseClientProvider,
) => LogReadRepoClickHouse;

export class FakeClickHouseClient {
  inserts: InsertOptions[] = [];
  queries: QueryOptions[] = [];
  queryResults: Record<string, unknown[]> = {};

  async insert(options: InsertOptions): Promise<void> {
    this.inserts.push(options);
  }

  async query(options: QueryOptions): Promise<{ json<T>(): Promise<T[]> }> {
    this.queries.push(options);
    // Find a result by matching query string partially or using a default
    const entry = Object.entries(this.queryResults).find(([key]) => options.query.includes(key));
    let result = entry?.[1] || [];

    const params = options.query_params || {};

    // Simple filtering emulation for loadCheckpoint and loadLatestReadModel
    if (params.userId && params.traceId) {
      result = result.filter((row: any) => {
        const u = row.user_id !== undefined ? row.user_id : row.userId;
        const t = row.trace_id !== undefined ? row.trace_id : row.traceId;
        return u === params.userId && t === params.traceId;
      });
    }
    
    if (params.threshold !== undefined) {
      const threshold = Number(params.threshold);
      result = result.filter((row: any) => {
        const val = row.importance_level !== undefined ? row.importance_level : row.importanceLevel;
        return val === undefined || val === null || val <= threshold;
      });
    }

    // console.log(`Query for ${options.query.trim().split('\n')[0]}... returns ${result.length} rows`);

    return {
      json: async <T>() => result as T[],
    };
  }
}

export const createFakeLogger = (): Logger<unknown> => {
  const logger = {
    getSubLogger: mock(() => logger),
    trace: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  } as unknown as Logger<unknown>;
  return logger;
};

export const createTestNode = (overrides: any = {}) => ({
  id: "node-1",
  userId: "user-1",
  traceId: "trace-1",
  nodeType: "op",
  data: { key: "val" },
  startedAt: 1000,
  endedAt: 2000,
  startMessage: "start",
  endMessage: "end",
  importanceLevel: 5,
  flowOrder: 1,
  materializedAt: 3000,
  ...overrides,
});

export const createTestEdge = (overrides: any = {}) => ({
  id: "edge-1",
  userId: "user-1",
  traceId: "trace-1",
  edgeType: "calls",
  fromNodeId: "node-1",
  toNodeId: "node-2",
  fromFlowOrder: 1,
  toFlowOrder: 2,
  data: { ekey: "eval" },
  startedAt: 1100,
  endedAt: 2100,
  materializedAt: 3000,
  ...overrides,
});

export const createTestSummary = (overrides: any = {}) => ({
  userId: "user-1",
  traceId: "trace-1",
  nodeCount: 1,
  edgeCount: 1,
  minImportanceLevel: 5,
  maxImportanceLevel: 5,
  startedAt: 1000,
  endedAt: 2000,
  materializedAt: 3000,
  diagMissingStarts: 0,
  diagMissingEnds: 0,
  diagNegativeDurations: 0,
  diagCycles: 0,
  diagOrphanEdges: 0,
  diagInvalidImportance: 0,
  diagClockSkew: 0,
  ...overrides,
});

export const createRepoWithFakeClient = (fakeClient: FakeClickHouseClient): LogReadRepoClickHouse => {
  return new RepoWithProvider(createFakeLogger(), () => fakeClient as any);
};

import { describe, expect, test } from "bun:test";
import { Logger } from "tslog";
import {
  CLICKHOUSE_READ_NODES_TABLE,
  CLICKHOUSE_READ_EDGES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
} from "../../../../../infra/db/clickhouse";
import { LogReadRepoClickHouse } from "./LogReadRepoClickHouse";

type InsertOptions = {
  table: string;
  values: unknown[];
  format: "JSONEachRow";
};

type ClickHouseClientProvider = () => {
  insert(options: InsertOptions): Promise<void>;
};

// Use type casting for testing with a fake provider
const RepoWithProvider = LogReadRepoClickHouse as unknown as new (
  parentLogger: Logger<unknown>,
  getClient: ClickHouseClientProvider,
) => LogReadRepoClickHouse;

class FakeClickHouseClient {
  inserts: InsertOptions[] = [];

  async insert(options: InsertOptions): Promise<void> {
    this.inserts.push(options);
  }
}

describe("LogReadRepoClickHouse row mapping", () => {
  test("saveReadModel inserts nodes, edges, and summary with correct snake_case mapping", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepo(fakeClient);

    const nodes = [
      {
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
      },
    ];

    const edges = [
      {
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
        endedAt: 1200,
        materializedAt: 3000,
      },
    ];

    const summary = {
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
    };

    await repo.saveReadModel({
      userId: "user-1",
      traceId: "trace-1",
      nodes,
      edges,
      summary,
      materializedAt: 3000,
    });

    const nodeInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_READ_NODES_TABLE);
    const edgeInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_READ_EDGES_TABLE);
    const summaryInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_TRACE_SUMMARIES_TABLE);

    expect(nodeInsert).toBeDefined();
    expect(nodeInsert?.format).toBe("JSONEachRow");
    expect(nodeInsert?.values[0]).not.toHaveProperty("scope");
    expect(nodeInsert?.values[0]).toMatchObject({
      id: "node-1",
      user_id: "user-1",
      trace_id: "trace-1",
      node_type: "op",
      data: { key: "val" },
      started_at_ms: 1000,
      ended_at_ms: 2000,
      start_message: "start",
      end_message: "end",
      importance_level: 5,
      flow_order: 1,
      materialized_at_ms: 3000,
    });

    expect(edgeInsert).toBeDefined();
    expect(edgeInsert?.format).toBe("JSONEachRow");
    expect(edgeInsert?.values[0]).toMatchObject({
      id: "edge-1",
      user_id: "user-1",
      trace_id: "trace-1",
      edge_type: "calls",
      from_node_id: "node-1",
      to_node_id: "node-2",
      from_flow_order: 1,
      to_flow_order: 2,
      data: { ekey: "eval" },
      started_at_ms: 1100,
      ended_at_ms: 1200,
      materialized_at_ms: 3000,
    });

    expect(summaryInsert).toBeDefined();
    expect(summaryInsert?.format).toBe("JSONEachRow");
    expect(summaryInsert?.values[0]).toMatchObject({
      user_id: "user-1",
      trace_id: "trace-1",
      node_count: 1,
      edge_count: 1,
      min_importance_level: 5,
      max_importance_level: 5,
      started_at_ms: 1000,
      ended_at_ms: 2000,
      materialized_at_ms: 3000,
      diagnostic_missing_starts_count: 0,
      diagnostic_missing_ends_count: 0,
      diagnostic_negative_duration_count: 0,
      diagnostic_cycle_count: 0,
      diagnostic_orphan_edge_count: 0,
      diagnostic_invalid_importance_count: 0,
      diagnostic_clock_skew_count: 0,
    });
  });

  test("saveCheckpoint inserts checkpoint with exact bookmark fields", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepo(fakeClient);

    const checkpoint = {
      userId: "user-1",
      traceId: "trace-1",
      lastNodeEventTime: 1500,
      lastNodeEventId: "node-a",
      lastNodeEventType: 0,
      lastEdgeEventTime: 1600,
      lastEdgeEventId: "edge-1",
      lastEdgeEventType: 1,
      checkpointedAt: 4000,
    };

    await repo.saveCheckpoint({ checkpoint });

    const cpInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE);

    expect(cpInsert).toBeDefined();
    expect(cpInsert?.format).toBe("JSONEachRow");
    expect(cpInsert?.values[0]).toMatchObject({
      user_id: "user-1",
      trace_id: "trace-1",
      node_progress_timestamp: 1500,
      node_progress_id: "node-a",
      node_progress_event_type: 0,
      edge_progress_timestamp: 1600,
      edge_progress_id: "edge-1",
      edge_progress_event_type: 1,
      updated_at_ms: 4000,
    });
  });
});

const createRepo = (fakeClient: FakeClickHouseClient): LogReadRepoClickHouse => {
  const logger = new Logger({ name: "LogReadRepoClickHouseTest" });
  return new RepoWithProvider(logger, () => fakeClient);
};

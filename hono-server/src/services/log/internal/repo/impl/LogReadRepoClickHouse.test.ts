import { describe, expect, test } from "bun:test";
// @ts-ignore
import { readFileSync } from "fs";
// @ts-ignore
import { join } from "path";
import {
  CLICKHOUSE_READ_NODES_TABLE,
  CLICKHOUSE_READ_EDGES_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_TABLE,
  CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE,
  CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE,
} from "../../../../../infra/db/clickhouse";
import { LogReadRepoClickHouse } from "./LogReadRepoClickHouse";
import { DEFAULT_PROJECTION_NODE_CAP, DEFAULT_PROJECTION_EDGE_CAP } from "../ILogReadRepo";
import { FakeClickHouseClient, createRepoWithFakeClient, createTestNode, createTestEdge, createTestSummary } from "./test-helpers";

describe("LogReadRepoClickHouse row mapping", () => {
  test("saveReadModel inserts nodes, edges, and summary with correct snake_case mapping", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const nodes = [createTestNode()];
    const edges = [createTestEdge()];
    const summary = createTestSummary();

    await repo.saveReadModel({ userId: "user-1", traceId: "trace-1", nodes, edges, summary, materializedAt: 3000 });

    const nodeInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_READ_NODES_TABLE);
    const edgeInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_READ_EDGES_TABLE);
    const summaryInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_TRACE_SUMMARIES_TABLE);

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
      ended_at_ms: 2100,
      materialized_at_ms: 3000,
    });

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
    });
  });

  test("saveCheckpoint inserts checkpoint with correct snake_case mapping", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const checkpoint = {
      userId: "u1",
      traceId: "t1",
      lastNodeEventTime: 1000,
      lastNodeEventId: "n1",
      lastNodeEventType: 0,
      lastEdgeEventTime: 1100,
      lastEdgeEventId: "e1",
      lastEdgeEventType: 1,
      checkpointedAt: 2000,
    };

    await repo.saveCheckpoint({ checkpoint });

    const insert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE);
    expect(insert?.values[0]).toMatchObject({
      user_id: "u1",
      trace_id: "t1",
      node_progress_timestamp: 1000,
      node_progress_id: "n1",
      node_progress_event_type: 0,
      edge_progress_timestamp: 1100,
      edge_progress_id: "e1",
      edge_progress_event_type: 1,
      updated_at_ms: 2000,
    });
  });
});

describe("LogReadRepoClickHouse row loading", () => {
  test("loadTraceSummaries returns a bounded tenant-scoped page", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_TABLE] = [
      {
        user_id: "u1",
        trace_id: "trace-a",
        node_count: 12,
        edge_count: 11,
        min_importance_level: 0,
        max_importance_level: 4,
        started_at_ms: 1000,
        ended_at_ms: 2500,
        materialized_at_ms: 3000,
        diagnostic_missing_starts_count: 0,
        diagnostic_missing_ends_count: 1,
        diagnostic_negative_duration_count: 0,
        diagnostic_cycle_count: 0,
        diagnostic_orphan_edge_count: 0,
        diagnostic_invalid_importance_count: 0,
        diagnostic_clock_skew_count: 2,
        diagnostic_limit_exceeded_count: 0,
        total_trace_count: 7,
      },
    ];

    const result = await repo.loadTraceSummaries({
      userId: "u1",
      paging: { offset: 5, limit: 5 },
    });

    expect(result.totalCount).toBe(7);
    expect(result.hasMore).toBe(false);
    expect(result.items[0]).toMatchObject({
      traceId: "trace-a",
      nodeCount: 12,
      edgeCount: 11,
      diagMissingEnds: 1,
      diagClockSkew: 2,
    });

    const query = fakeClient.queries.find((item) =>
      item.query.includes("total_trace_count")
    );
    expect(query?.query).toContain("WHERE user_id = {userId:String}");
    expect(query?.query).toContain("ORDER BY materialized_at_ms DESC, trace_id ASC");
    expect(query?.query_params).toMatchObject({
      userId: "u1",
      limit: 6,
      offset: 5,
    });
  });

  test("loadCheckpoint maps snake_case back to camelCase and handles empty results", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    fakeClient.queryResults[CLICKHOUSE_MATERIALIZATION_CHECKPOINTS_TABLE] = [
      {
        user_id: "u1",
        trace_id: "t1",
        node_progress_timestamp: 1000,
        node_progress_id: "n1",
        node_progress_event_type: 0,
        edge_progress_timestamp: 1100,
        edge_progress_id: "e1",
        edge_progress_event_type: 1,
        updated_at_ms: 2000,
      },
    ];

    const result = await repo.loadCheckpoint({ userId: "u1", traceId: "t1" });
    expect(result).toMatchObject({
      userId: "u1",
      traceId: "t1",
      lastNodeEventTime: 1000,
      lastNodeEventId: "n1",
      lastNodeEventType: 0,
      lastEdgeEventTime: 1100,
      lastEdgeEventId: "e1",
      lastEdgeEventType: 1,
      checkpointedAt: 2000,
    });

    const emptyResult = await repo.loadCheckpoint({ userId: "u2", traceId: "t2" });
    expect(emptyResult).toBeNull();
  });

  test("loadLatestReadModel maps all tables and handles JSON parsing", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    fakeClient.queryResults[CLICKHOUSE_READ_NODES_TABLE] = [
      { id: "n1", user_id: "u1", trace_id: "t1", data: { a: 1 }, started_at_ms: 100, ended_at_ms: 200, importance_level: 1, flow_order: 1 },
    ];
    fakeClient.queryResults[CLICKHOUSE_READ_EDGES_TABLE] = [
      { id: "e1", user_id: "u1", trace_id: "t1", data: {}, started_at_ms: 150, ended_at_ms: null, from_node_id: "n1", to_node_id: "n2", from_flow_order: 1, to_flow_order: 2 },
    ];
    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_TABLE] = [
      { user_id: "u1", trace_id: "t1", node_count: 1, edge_count: 1 },
    ];

    const result = await repo.loadLatestReadModel({ userId: "u1", traceId: "t1" });
    expect(result.nodes[0]).toMatchObject({ id: "n1", data: { a: 1 }, startedAt: 100, endedAt: 200 });
    expect(result.edges[0]).toMatchObject({ id: "e1", fromNodeId: "n1", toNodeId: "n2" });
    expect(result.summary).toMatchObject({ nodeCount: 1, edgeCount: 1 });
  });

  test("loadTraceSummary maps summary, queries realtime table and merges with worker diagnostics", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE] = [
      {
        user_id: "u1",
        trace_id: "t1",
        node_count: 15,
        edge_count: 12,
        min_importance_level: 1,
        max_importance_level: 3,
        started_at_ms: 5000,
        ended_at_ms: 8000,
        materialized_at_ms: 10000,
      },
    ];

    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_TABLE] = [
      {
        user_id: "u1",
        trace_id: "t1",
        node_count: 5,
        edge_count: 4,
        min_importance_level: 1,
        max_importance_level: 3,
        started_at_ms: 5000,
        ended_at_ms: 8000,
        materialized_at_ms: 9000,
        diagnostic_missing_starts_count: 2,
        diagnostic_missing_ends_count: 3,
        diagnostic_negative_duration_count: 0,
        diagnostic_cycle_count: 1,
        diagnostic_orphan_edge_count: 0,
        diagnostic_invalid_importance_count: 0,
        diagnostic_clock_skew_count: 0,
        diagnostic_limit_exceeded_count: 0,
      },
    ];

    const result = await repo.loadTraceSummary({ userId: "u1", traceId: "t1" });
    expect(result).toMatchObject({
      userId: "u1",
      traceId: "t1",
      nodeCount: 15,
      edgeCount: 12,
      minImportanceLevel: 1,
      maxImportanceLevel: 3,
      startedAt: 5000,
      endedAt: 8000,
      materializedAt: 10000,
      diagMissingStarts: 2,
      diagMissingEnds: 3,
      diagCycles: 1,
    });

    const empty = await repo.loadTraceSummary({ userId: "u2", traceId: "t2" });
    expect(empty).toBeNull();
  });

  test("loadRawEventsAfterCheckpoint applies correct threshold logic", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const checkpoint = {
      userId: "u1",
      traceId: "t1",
      lastNodeEventTime: 1000,
      lastNodeEventId: "n1",
      lastNodeEventType: 0,
      lastEdgeEventTime: 1100,
      lastEdgeEventId: "e1",
      lastEdgeEventType: 1,
      checkpointedAt: 2000,
    };

    await repo.loadRawEventsAfterCheckpoint({ userId: "u1", traceId: "t1", checkpoint });

    const nodeQuery = fakeClient.queries.find(q => q.query.includes("node_events"));
    const edgeQuery = fakeClient.queries.find(q => q.query.includes("edge_events"));

    expect(nodeQuery?.query).toContain("tuple(");
    expect(nodeQuery?.query).toContain("started_at_ms");
    expect(nodeQuery?.query).toContain("ORDER BY");
    expect(nodeQuery?.query_params).toMatchObject({
      lastNodeEventTime: 1000,
      lastNodeEventId: "n1",
      lastNodeEventType: 0,
    });

    expect(edgeQuery?.query_params).toMatchObject({
      lastEdgeEventTime: 1100,
      lastEdgeEventId: "e1",
      lastEdgeEventType: 1,
    });
  });

  test("loadRawEventsAfterCheckpoint handles null checkpoint with defaults", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    await repo.loadRawEventsAfterCheckpoint({ userId: "u1", traceId: "t1", checkpoint: null });

    const nodeQuery = fakeClient.queries.find(q => q.query.includes("node_events"));
    expect(nodeQuery?.query_params).toMatchObject({
      lastNodeEventTime: 0,
      lastNodeEventId: "",
      lastNodeEventType: 0,
    });
  });
});

describe("LogReadRepoClickHouse bounded projection node reads", () => {
  test("loadBoundedVisibleNodes respects cap and threshold with correct query scoping", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    // Prepare DEFAULT_PROJECTION_NODE_CAP + 1 rows
    const fakeRows = Array.from({ length: DEFAULT_PROJECTION_NODE_CAP + 1 }, (_, i) => ({
      id: `n${i}`,
      user_id: "u1",
      trace_id: "t1",
      node_type: "op",
      data: "{}",
      started_at_ms: 1000 + i,
      ended_at_ms: 1100 + i,
      start_message: "start",
      end_message: "end",
      importance_level: 2,
      flow_order: i,
      materialized_at_ms: 2000,
    }));

    fakeClient.queryResults[CLICKHOUSE_READ_NODES_TABLE] = fakeRows.map(r => ({ ...r, total_node_count: fakeRows.length }));

    const result = await repo.loadBoundedVisibleNodes({
      userId: "u1",
      traceId: "t1",
      threshold: 2,
      paging: { offset: 0, limit: DEFAULT_PROJECTION_NODE_CAP },
    });

    expect(result.items).toHaveLength(DEFAULT_PROJECTION_NODE_CAP);
    expect(result.totalCount).toBe(DEFAULT_PROJECTION_NODE_CAP + 1);
    expect(result.hasMore).toBe(true);

    const query = fakeClient.queries.find(q => q.query.includes(CLICKHOUSE_READ_NODES_TABLE));
    expect(query).toBeDefined();
    expect(query?.query).toContain("WHERE n.user_id = {userId:String} AND n.trace_id = {traceId:String}");
    expect(query?.query).toContain("importance_level <= {threshold:Int32}");
    expect(query?.query).toContain("flow_order >= {offset:UInt32}");
    expect(query?.query).toContain("ORDER BY flow_order ASC, id ASC");
    expect(query?.query).toContain("LIMIT {limit:UInt32}");
    expect(query?.query).toContain("argMax");

    expect(query?.query_params).toMatchObject({
      userId: "u1",
      traceId: "t1",
      threshold: 2,
      offset: 0,
      limit: DEFAULT_PROJECTION_NODE_CAP + 1,
    });
  });

  test("loadBoundedVisibleNodes maps all fields correctly and handles non-cap-hit", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const materializedAt = Date.now();
    fakeClient.queryResults[CLICKHOUSE_READ_NODES_TABLE] = [
      createTestNode({ id: "n1", userId: "u1", traceId: "t1", materialized_at_ms: materializedAt }),
      createTestNode({ id: "n2", userId: "u1", traceId: "t1", materialized_at_ms: materializedAt, importanceLevel: 3, flowOrder: 10 }),
    ].map(n => ({
      ...n,
      user_id: n.userId,
      trace_id: n.traceId,
      node_type: n.nodeType,
      started_at_ms: n.startedAt,
      ended_at_ms: n.endedAt,
      importance_level: n.importanceLevel,
      flow_order: n.flowOrder,
    }));


    const result = await repo.loadBoundedVisibleNodes({
      userId: "u1",
      traceId: "t1",
      threshold: 5,
      paging: { offset: 0, limit: 100 },
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);

    const n1 = result.items.find(n => n.id === "n1");
    expect(n1).toMatchObject({
      id: "n1",
      userId: "u1",
      traceId: "t1",
      nodeType: "op",
      startedAt: 1000,
      endedAt: 2000,
      importanceLevel: 5, // from createTestNode default
    });
  });

  test("bounded projection methods implementation do not call loadLatestReadModel", async () => {
    const repo = LogReadRepoClickHouse.prototype;
    
    for (const methodName of ["loadBoundedVisibleNodes", "loadBoundedVisibleEdges", "loadBoundedProjectionNodes"] as const) {
      const body = repo[methodName].toString();
      // It should not call its sibling method which loads everything
      expect(body).not.toContain("this.loadLatestReadModel");
      // It should not contain the string literal either
      expect(body).not.toContain("loadLatestReadModel");
    }
  });

  test("Phase 5 source boundary: no leaks of cross-cutting concerns", async () => {
    // Try both common cwd locations
    let content = "";
    try {
      content = readFileSync(join(process.cwd(), "src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts"), "utf-8");
    } catch {
      try {
        content = readFileSync(join(process.cwd(), "hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts"), "utf-8");
      } catch {
        throw new Error("Could not find LogReadRepoClickHouse.ts to run boundary check");
      }
    }

    // Forbidden terms that belong to future layers or are restricted
    const forbidden = [
      "snapped",
      "aggregate edge", // we use 'edges' table but not 'aggregate'
      "getProjectedFlow",
      "/telemetry",
      "frontend",
      "sdk/nodejs",
      "carno.js",
    ];

    for (const term of forbidden) {
      expect(content.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});

describe("LogReadRepoClickHouse bounded projection node reads", () => {
  test("loadBoundedProjectionNodes respects cap without threshold filter", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    // Prepare DEFAULT_PROJECTION_NODE_CAP + 1 rows
    const fakeRows = Array.from({ length: DEFAULT_PROJECTION_NODE_CAP + 1 }, (_, i) => ({
      id: `n${i}`,
      user_id: "u1",
      trace_id: "t1",
      node_type: "op",
      data: "{}",
      started_at_ms: 1000 + i,
      ended_at_ms: 1100 + i,
      start_message: "start",
      end_message: "end",
      importance_level: i, // Mix of levels
      flow_order: i,
      materialized_at_ms: 2000,
    }));

    fakeClient.queryResults[CLICKHOUSE_READ_NODES_TABLE] = fakeRows.map(r => ({ ...r, total_node_count: fakeRows.length }));

    const result = await repo.loadBoundedProjectionNodes({
      userId: "u1",
      traceId: "t1",
      paging: { offset: 0, limit: DEFAULT_PROJECTION_NODE_CAP },
    });

    expect(result.items).toHaveLength(DEFAULT_PROJECTION_NODE_CAP);
    expect(result.hasMore).toBe(true);

    const query = fakeClient.queries.find(q => q.query.includes(CLICKHOUSE_READ_NODES_TABLE));
    expect(query).toBeDefined();
    expect(query?.query).toContain("WHERE n.user_id = {userId:String} AND n.trace_id = {traceId:String}");
    expect(query?.query).not.toContain("importance_level <=");
    expect(query?.query_params).toMatchObject({
      userId: "u1",
      traceId: "t1",
      limit: DEFAULT_PROJECTION_NODE_CAP + 1,
    });
  });
});

describe("LogReadRepoClickHouse bounded projection edge reads", () => {
  test("loadBoundedVisibleEdges short circuits with empty nodeIds", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const result = await repo.loadBoundedVisibleEdges({
      userId: "u1",
      traceId: "t1",
      nodeIds: [],
    });

    expect(result.edges).toHaveLength(0);
    expect(result.cap.capHit).toBe(false);
    expect(fakeClient.queries).toHaveLength(0);
  });

  test("loadBoundedVisibleEdges respects cap and filters by visible nodeIds", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    // Prepare DEFAULT_PROJECTION_EDGE_CAP + 1 rows
    const fakeRows = Array.from({ length: DEFAULT_PROJECTION_EDGE_CAP + 1 }, (_, i) => ({
      id: `e${i}`,
      user_id: "u1",
      trace_id: "t1",
      edge_type: "calls",
      from_node_id: i % 2 === 0 ? "node-a" : "other",
      to_node_id: i % 2 === 0 ? "other" : "node-b",
      from_flow_order: i,
      to_flow_order: i + 1,
      data: "{}",
      started_at_ms: 1000 + i,
      ended_at_ms: 1100 + i,
      materialized_at_ms: 2000,
    }));

    fakeClient.queryResults[CLICKHOUSE_READ_EDGES_TABLE] = fakeRows;

    const result = await repo.loadBoundedVisibleEdges({
      userId: "u1",
      traceId: "t1",
      nodeIds: ["node-a", "node-b"],
    });

    expect(result.edges).toHaveLength(DEFAULT_PROJECTION_EDGE_CAP);
    expect(result.cap.capHit).toBe(true);

    const query = fakeClient.queries.find(q => q.query.includes(CLICKHOUSE_READ_EDGES_TABLE));
    expect(query).toBeDefined();
    expect(query?.query_params).toMatchObject({
      userId: "u1",
      traceId: "t1",
      nodeIds: ["node-a", "node-b"],
      limit: DEFAULT_PROJECTION_EDGE_CAP + 1,
    });
  });
});

describe("LogReadRepoClickHouse persistence mapping hardening (D-15, FR5)", () => {
  test("saveReadModel correctly maps corrected timestamps and skew diagnostics for nodes", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const correctedNode = createTestNode({
      id: "node-corrected",
      startedAt: 1050, // Corrected value
      originalStartedAt: 1000, // Raw value from log
      clockSkewMs: 50, // Delta
    });

    await repo.saveReadModel({
      userId: "user-1",
      traceId: "trace-1",
      nodes: [correctedNode],
      edges: [],
      summary: createTestSummary(),
      materializedAt: 3000,
    });

    const nodeInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_READ_NODES_TABLE);
    expect(nodeInsert).toBeDefined();
    expect(nodeInsert?.values[0]).toMatchObject({
      id: "node-corrected",
      started_at_ms: 1050,
      original_started_at_ms: 1000,
      clock_skew_ms: 50,
    });
  });

  test("saveReadModel correctly maps trace summary skew diagnostics (FR5)", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    const summaryWithSkew = createTestSummary({
      diagClockSkew: 42, // Total number of corrections in trace
    });

    await repo.saveReadModel({
      userId: "user-1",
      traceId: "trace-1",
      nodes: [],
      edges: [],
      summary: summaryWithSkew,
      materializedAt: 3000,
    });

    const summaryInsert = fakeClient.inserts.find(i => i.table === CLICKHOUSE_TRACE_SUMMARIES_TABLE);
    expect(summaryInsert).toBeDefined();
    expect(summaryInsert?.values[0]).toMatchObject({
      diagnostic_clock_skew_count: 42,
    });
  });
});

describe("LogReadRepoClickHouse Hybrid Real-time Summary Aggressive Edge Cases", () => {
  test("should handle missing start/end times and null values resiliently", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    // Real-time table has missing started_at_ms or ended_at_ms (e.g. unfinished traces)
    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE] = [
      {
        user_id: "u1",
        trace_id: "t1",
        node_count: 5,
        edge_count: 0,
        min_importance_level: null,
        max_importance_level: null,
        started_at_ms: null,
        ended_at_ms: null,
        materialized_at_ms: 1000,
      },
    ];

    const result = await repo.loadTraceSummary({ userId: "u1", traceId: "t1" });
    expect(result).toMatchObject({
      userId: "u1",
      traceId: "t1",
      nodeCount: 5,
      edgeCount: 0,
      minImportanceLevel: 0,
      maxImportanceLevel: 0,
      startedAt: 0,
      endedAt: null,
      materializedAt: 1000,
    });
  });

  test("should handle extreme importance levels and large integer bounds", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE] = [
      {
        user_id: "u1",
        trace_id: "t1",
        node_count: 999999,
        edge_count: 888888,
        min_importance_level: -5000,
        max_importance_level: 99999,
        started_at_ms: 1718000000000,
        ended_at_ms: 1718000005000,
        materialized_at_ms: 1718000010000,
      },
    ];

    const result = await repo.loadTraceSummary({ userId: "u1", traceId: "t1" });
    expect(result).toMatchObject({
      userId: "u1",
      traceId: "t1",
      nodeCount: 999999,
      edgeCount: 888888,
      minImportanceLevel: -5000,
      maxImportanceLevel: 99999,
      startedAt: 1718000000000,
      endedAt: 1718000005000,
      materializedAt: 1718000010000,
    });
  });

  test("should fallback entirely to worker table if realtime table returns no rows", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepoWithFakeClient(fakeClient);

    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_REALTIME_TABLE] = [];
    fakeClient.queryResults[CLICKHOUSE_TRACE_SUMMARIES_TABLE] = [
      {
        user_id: "u1",
        trace_id: "t1",
        node_count: 4,
        edge_count: 3,
        min_importance_level: 0,
        max_importance_level: 2,
        started_at_ms: 2000,
        ended_at_ms: 3000,
        materialized_at_ms: 4000,
        diagnostic_missing_starts_count: 1,
        diagnostic_missing_ends_count: 1,
        diagnostic_negative_duration_count: 1,
        diagnostic_cycle_count: 0,
        diagnostic_orphan_edge_count: 2,
        diagnostic_invalid_importance_count: 0,
        diagnostic_clock_skew_count: 1,
        diagnostic_limit_exceeded_count: 0,
      },
    ];

    const result = await repo.loadTraceSummary({ userId: "u1", traceId: "t1" });
    expect(result).toMatchObject({
      userId: "u1",
      traceId: "t1",
      nodeCount: 4,
      edgeCount: 3,
      minImportanceLevel: 0,
      maxImportanceLevel: 2,
      startedAt: 2000,
      endedAt: 3000,
      materializedAt: 4000,
      diagMissingStarts: 1,
      diagMissingEnds: 1,
      diagNegativeDurations: 1,
      diagCycles: 0,
      diagOrphanEdges: 2,
      diagClockSkew: 1,
    });
  });
});

import { describe, expect, test } from "bun:test";
import { Logger } from "tslog";
import {
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
} from "../../../../../infra/db/clickhouse";
import { LogWriteRepoClickHouse } from "./LogWriteRepoClickHouse";

type InsertOptions = {
  table: string;
  values: unknown[];
  format: "JSONEachRow";
};

type ClickHouseClientProvider = () => {
  insert(options: InsertOptions): Promise<void>;
};

const RepoWithProvider = LogWriteRepoClickHouse as unknown as new (
  parentLogger: Logger<unknown>,
  getClient: ClickHouseClientProvider,
) => LogWriteRepoClickHouse;

class FakeClickHouseClient {
  inserts: InsertOptions[] = [];

  async insert(options: InsertOptions): Promise<void> {
    this.inserts.push(options);
  }
}

describe("LogWriteRepoClickHouse row mapping", () => {
  test("inserts explicit edge endpoints and lifecycle timestamps", async () => {
    const fakeClient = new FakeClickHouseClient();
    const repo = createRepo(fakeClient);

    await repo.ingestNodesNEdges({
      userId: "user-1",
      nodeStarts: [
        {
          id: "node-a",
          traceId: "trace-1",
          nodeType: "operation",
          data: { name: "source" },
          startedAt: 900,
          importanceLevel: 1,
        },
      ],
      edgeStarts: [
        {
          id: "edge-1",
          traceId: "trace-1",
          edgeType: "calls",
          fromNodeId: "node-a",
          toNodeId: "node-b",
          data: { label: "calls" },
          startedAt: 1000,
        },
      ],
      nodeEnds: [
        {
          id: "node-a",
          traceId: "trace-1",
          endedAt: 1200,
        },
      ],
      edgeEnds: [
        {
          id: "edge-1",
          traceId: "trace-1",
          endedAt: 1500,
        },
      ],
    });

    const nodeInsert = fakeClient.inserts.find(
      (insert) => insert.table === CLICKHOUSE_NODE_EVENTS_TABLE,
    );
    const edgeInsert = fakeClient.inserts.find(
      (insert) => insert.table === CLICKHOUSE_EDGE_EVENTS_TABLE,
    );

    expect(nodeInsert).toMatchObject({
      table: CLICKHOUSE_NODE_EVENTS_TABLE,
      format: "JSONEachRow",
    });
    expect(edgeInsert).toMatchObject({
      table: CLICKHOUSE_EDGE_EVENTS_TABLE,
      format: "JSONEachRow",
    });

    expect(nodeInsert?.values).toHaveLength(2);
    expect(edgeInsert?.values).toHaveLength(2);
    expect(nodeInsert?.values[0]).toMatchObject({
      event_type: 0,
      started_at_ms: 900,
      ended_at_ms: null,
    });
    expect(nodeInsert?.values[1]).toMatchObject({
      event_type: 1,
      started_at_ms: null,
      ended_at_ms: 1200,
    });
    expect(edgeInsert?.values[0]).toMatchObject({
      id: "edge-1",
      user_id: "user-1",
      trace_id: "trace-1",
      event_type: 0,
      started_at_ms: 1000,
      ended_at_ms: null,
      edge_type: "calls",
      from_node_id: "node-a",
      to_node_id: "node-b",
      data: { label: "calls" },
    });
    expect(edgeInsert?.values[1]).toMatchObject({
      id: "edge-1",
      user_id: "user-1",
      trace_id: "trace-1",
      event_type: 1,
      started_at_ms: null,
      ended_at_ms: 1500,
      edge_type: null,
      from_node_id: null,
      to_node_id: null,
      data: {},
    });
  });
});

const createRepo = (fakeClient: FakeClickHouseClient): LogWriteRepoClickHouse => {
  const logger = new Logger({ name: "LogWriteRepoClickHouseTest" });
  return new RepoWithProvider(logger, () => fakeClient);
};

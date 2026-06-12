import { describe, expect, test } from "bun:test";
import { Logger } from "tslog";
import {
  CLICKHOUSE_EDGE_EVENTS_TABLE,
  CLICKHOUSE_NODE_EVENTS_TABLE,
  CLICKHOUSE_TRACE_EVENTS_TABLE,
} from "../../../../../infra/db/clickhouse";
import { LogWriteRepoClickHouse } from "./LogWriteRepoClickHouse";

type InsertOptions = {
  table: string;
  values: any[];
};

describe("LogWriteRepoClickHouse row mapping", () => {
  const mockLogger = new Logger({ name: "LogWriteRepoClickHouseTest" });

  test("inserts trace, node and edge events correctly", async () => {
    const inserts: InsertOptions[] = [];
    const mockClient = {
      insert: async (options: InsertOptions) => {
        inserts.push(options);
      },
    } as any;

    const repo = new LogWriteRepoClickHouse(mockLogger, () => mockClient);

    await repo.ingestNodesNEdges({
      userId: "user-1",
      traceStarts: [
        {
          traceId: "t1",
          name: "Test Trace",
          importanceLabels: { 0: "DB" },
          timestamp: 1000,
        },
      ],
      nodeStarts: [
        {
          id: "n1",
          traceId: "t1",
          nodeType: "span",
          data: { key: "val" },
          startMessage: "start",
          startedAt: 900,
          importanceLevel: 1,
        },
      ],
      edgeStarts: [
        {
          id: "e1",
          traceId: "t1",
          edgeType: "child",
          fromNodeId: "n1",
          toNodeId: "n2",
          data: {},
          startedAt: 950,
        },
      ],
      nodeEnds: [],
      edgeEnds: [],
    });

    expect(inserts.length).toBe(3);

    const traceInsert = inserts.find((i) => i.table === CLICKHOUSE_TRACE_EVENTS_TABLE);
    expect(traceInsert?.values[0]).toEqual({
      user_id: "user-1",
      trace_id: "t1",
      event_type: 0,
      name: "Test Trace",
      importance_labels: { 0: "DB" },
      timestamp_ms: 1000,
    });

    const nodeInsert = inserts.find((i) => i.table === CLICKHOUSE_NODE_EVENTS_TABLE);
    expect(nodeInsert?.values[0].trace_id).toBe("t1");
    expect(nodeInsert?.values[0].trace_name).toBeUndefined(); // Should be removed
  });
});

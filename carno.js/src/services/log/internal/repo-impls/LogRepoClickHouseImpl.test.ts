import { describe, expect, it } from "bun:test";
import type { ClickHouseService } from "../../../../infra/ClickHouseService";
import { LogRepoClickHouseImpl } from "./LogRepoClickHouseImpl";

class MockClickHouseClient {
  insertedTable = "";
  insertedValues: any[] = [];

  async insert(options: { table: string; values: any[] }): Promise<void> {
    this.insertedTable = options.table;
    this.insertedValues = options.values;
  }
}

describe("LogRepoClickHouseImpl V4 Spans", () => {
  it("writes raw spans to ClickHouse raw_spans table", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveSpans([
      {
        id: "span_a",
        traceId: "trace_id_x",
        parentId: "span_parent",
        name: "test-span",
        kind: "boundary",
        type: "service",
        tags: { env: "prod", version: "1.0.0" },
        eventType: "started",
        timestamp: new Date(100),
        levelNames: { 0: "L0", 1: "L1" },
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.raw_spans");
    expect(client.insertedValues[0]).toMatchObject({
      id: "span_a",
      trace_id: "trace_id_x",
      parent_id: "span_parent",
      name: "test-span",
      kind: "boundary",
      type: "service",
      tags: { env: "prod", version: "1.0.0" },
      event_type: "started",
      timestamp: 100,
      level_names: { 0: "L0", 1: "L1" },
    });
  });

  it("writes raw edges to ClickHouse raw_edges table", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveEdges([
      {
        id: "edge_a",
        traceId: "trace_id_x",
        fromSpanId: "span_source",
        toSpanId: "span_target",
        type: "rpc_call",
        timestamp: new Date(200),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.raw_edges");
    expect(client.insertedValues[0]).toMatchObject({
      id: "edge_a",
      trace_id: "trace_id_x",
      from_span_id: "span_source",
      to_span_id: "span_target",
      type: "rpc_call",
      timestamp: 200,
    });
  });
});

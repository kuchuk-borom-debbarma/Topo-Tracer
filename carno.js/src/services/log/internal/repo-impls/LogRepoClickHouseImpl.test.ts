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

describe("LogRepoClickHouseImpl", () => {
  it("writes blocks to ClickHouse", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveBlocks([
      {
        id: "block",
        traceId: "trace",
        containerId: "api",
        name: "foo()",
        type: "function",
        metadata: { route: "/orders" },
        startedAtLocal: new Date(10),
        endedAtLocal: new Date(20),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.blocks");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      containerId: "api",
      type: "function",
      metadata: JSON.stringify({ route: "/orders" }),
      startedAtLocal: 10,
      endedAtLocal: 20,
    });
  });

  it("writes edges as primitive node connections", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveEdges([
      {
        id: "edge_a_b",
        traceId: "trace",
        fromNodeId: "node_a",
        toNodeId: "node_b",
        type: "call",
        metadata: { sync: true },
        occurredAtLocal: new Date(30),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.edges");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      fromNodeId: "node_a",
      toNodeId: "node_b",
      type: "call",
      metadata: JSON.stringify({ sync: true }),
      occurredAtLocal: 30,
    });
  });
});
